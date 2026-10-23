import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const patientRequire = createRequire(new URL('../apps/patient/package.json', import.meta.url));
const expoRequire = createRequire(patientRequire.resolve('expo/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
const forge = cliRequire('node-forge');
const certificates = cliRequire('@expo/code-signing-certificates');
const message = Buffer.from('SHIFAA synthetic ephemeral signature regression');
const asn1 = forge.asn1;
const universal = asn1.Class.UNIVERSAL;
const type = asn1.Type;
const invalidDigestInfo =
  /ASN\.1 object does not contain a valid RSASSA-PKCS1-v1_5 DigestInfo value/;

function digestInfo(digest, withNull, extra) {
  const algorithm = [
    asn1.create(universal, type.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes()),
  ];
  if (withNull) algorithm.push(asn1.create(universal, type.NULL, false, ''));
  if (extra) algorithm.push(extra());
  return asn1.create(universal, type.SEQUENCE, true, [
    asn1.create(universal, type.SEQUENCE, true, algorithm),
    asn1.create(universal, type.OCTETSTRING, false, digest),
  ]);
}

// GHSA-86w9-cpqp-85rv: test actual installed consumers with both low and usual
// public exponents. Keys/signatures stay in memory and are never logged.
for (const exponent of [3, 65537]) {
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: exponent });
  const privateKey = forge.pki.privateKeyFromPem(
    keys.privateKey.export({ type: 'pkcs1', format: 'pem' }),
  );
  const publicKey = forge.pki.publicKeyFromPem(
    keys.publicKey.export({ type: 'pkcs1', format: 'pem' }),
  );
  const digest = crypto.createHash('sha256').update(message).digest('binary');

  test(`valid signature remains accepted, exponent ${exponent}`, () => {
    const signature = crypto.sign('sha256', message, keys.privateKey);
    assert.equal(publicKey.verify(digest, signature.toString('binary')), true);
  });

  for (const withNull of [false, true]) {
    test(`valid DigestAlgorithm NULL=${withNull}, exponent ${exponent}`, () => {
      const signature = privateKey.sign(
        asn1.toDer(digestInfo(digest, withNull)).getBytes(),
        'NONE',
      );
      assert.equal(publicKey.verify(digest, signature), true);
    });
    const extras = {
      NULL: () => asn1.create(universal, type.NULL, false, ''),
      OCTETSTRING: () => asn1.create(universal, type.OCTETSTRING, false, 'synthetic extra field'),
      SEQUENCE: () => asn1.create(universal, type.SEQUENCE, true, []),
    };
    for (const [name, extra] of Object.entries(extras)) {
      if (!withNull && name === 'NULL') continue; // A single NULL is the valid optional parameter.
      test(`extra ${name} rejected, NULL=${withNull}, exponent ${exponent}`, () => {
        const signature = privateKey.sign(
          asn1.toDer(digestInfo(digest, withNull, extra)).getBytes(),
          'NONE',
        );
        assert.equal(
          crypto.verify('sha256', message, keys.publicKey, Buffer.from(signature, 'binary')),
          false,
        );
        assert.throws(() => publicKey.verify(digest, signature), invalidDigestInfo);
      });
    }
  }

  test(`outer DigestInfo extra field remains rejected, exponent ${exponent}`, () => {
    const malformed = digestInfo(digest, true);
    malformed.value.push(asn1.create(universal, type.NULL, false, ''));
    const signature = privateKey.sign(asn1.toDer(malformed).getBytes(), 'NONE');
    assert.throws(() => publicKey.verify(digest, signature), invalidDigestInfo);
  });

  for (const paddingBytes of [1, 64]) {
    test(`nonempty NULL parameter rejected, bytes=${paddingBytes}, exponent ${exponent}`, () => {
      const malformed = digestInfo(digest, true);
      malformed.value[0].value[1].value = 'x'.repeat(paddingBytes);
      const signature = privateKey.sign(asn1.toDer(malformed).getBytes(), 'NONE');
      assert.equal(
        crypto.verify('sha256', message, keys.publicKey, Buffer.from(signature, 'binary')),
        false,
      );
      assert.throws(() => publicKey.verify(digest, signature), invalidDigestInfo);
    });
  }

  test(`wrong digest remains rejected, exponent ${exponent}`, () => {
    const signature = crypto.sign('sha256', message, keys.privateKey);
    const wrongDigest = crypto
      .createHash('sha256')
      .update('different synthetic message')
      .digest('binary');
    assert.equal(publicKey.verify(wrongDigest, signature.toString('binary')), false);
  });

  test(`PSS signature remains accepted, exponent ${exponent}`, () => {
    const signature = crypto.sign('sha256', message, {
      key: keys.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    });
    const scheme = forge.pss.create({
      md: forge.md.sha256.create(),
      mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
      saltLength: 32,
    });
    assert.equal(publicKey.verify(digest, signature.toString('binary'), scheme), true);
  });

  test(`actual Expo certificate signing remains compatible, exponent ${exponent}`, () => {
    const pair = { privateKey, publicKey };
    const certificate = certificates.generateSelfSignedCodeSigningCertificate({
      keyPair: pair,
      validityNotBefore: new Date(Date.now() - 60000),
      validityNotAfter: new Date(Date.now() + 60000),
      commonName: 'SHIFAA synthetic ephemeral regression',
    });
    const parsed = certificates.convertCertificatePEMToCertificate(
      certificates.convertCertificateToCertificatePEM(certificate),
    );
    certificates.validateSelfSignedCertificate(parsed, pair);
    const signed = certificates.signBufferRSASHA256AndVerify(privateKey, parsed, message);
    assert.equal(
      crypto.verify('sha256', message, keys.publicKey, Buffer.from(signed, 'base64')),
      true,
    );
  });

  test(`actual Expo certificate validation rejects nested garbage, exponent ${exponent}`, () => {
    const pair = { privateKey, publicKey };
    const certificate = certificates.generateSelfSignedCodeSigningCertificate({
      keyPair: pair,
      validityNotBefore: new Date(Date.now() - 60000),
      validityNotAfter: new Date(Date.now() + 60000),
      commonName: 'SHIFAA synthetic malformed certificate regression',
    });
    const parsed = certificates.convertCertificatePEMToCertificate(
      certificates.convertCertificateToCertificatePEM(certificate),
    );
    const tbs = Buffer.from(asn1.toDer(forge.pki.getTBSCertificate(parsed)).getBytes(), 'binary');
    const certificateDigest = crypto.createHash('sha256').update(tbs).digest('binary');
    const extra = () => asn1.create(universal, type.SEQUENCE, true, []);
    parsed.signature = privateKey.sign(
      asn1.toDer(digestInfo(certificateDigest, true, extra)).getBytes(),
      'NONE',
    );
    assert.throws(
      () => certificates.validateSelfSignedCertificate(parsed, pair),
      invalidDigestInfo,
    );
  });

  test(`actual Expo certificate validation rejects nonempty NULL, exponent ${exponent}`, () => {
    const pair = { privateKey, publicKey };
    const certificate = certificates.generateSelfSignedCodeSigningCertificate({
      keyPair: pair,
      validityNotBefore: new Date(Date.now() - 60000),
      validityNotAfter: new Date(Date.now() + 60000),
      commonName: 'SHIFAA synthetic malformed NULL regression',
    });
    const parsed = certificates.convertCertificatePEMToCertificate(
      certificates.convertCertificateToCertificatePEM(certificate),
    );
    const tbs = Buffer.from(asn1.toDer(forge.pki.getTBSCertificate(parsed)).getBytes(), 'binary');
    const certificateDigest = crypto.createHash('sha256').update(tbs).digest('binary');
    const malformed = digestInfo(certificateDigest, true);
    malformed.value[0].value[1].value = 'synthetic invalid NULL contents';
    parsed.signature = privateKey.sign(asn1.toDer(malformed).getBytes(), 'NONE');
    assert.throws(
      () => certificates.validateSelfSignedCertificate(parsed, pair),
      invalidDigestInfo,
    );
  });
}
