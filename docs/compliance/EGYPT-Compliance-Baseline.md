# SHIFAA Egyptian Compliance and Clinical-Safety Baseline

> **Version:** 1.1.0 · **Status:** Researched baseline, not legal advice · **Last checked:** 2026-08-09  
> **Owners:** Legal counsel, registered DPO, Medical Director, Chief Pharmacist  
> A source supports only the proposition stated beside it. Product policy is labeled as policy; unpublished details remain open.

## 1. Evidence labels

- **LAW/REGULATION:** binding text or regulator-issued instrument.
- **REGULATOR GUIDANCE:** official operational interpretation/checklist; confirm legal force with counsel.
- **OFFICIAL STATUS:** an authority announcement about a project/service, not necessarily a binding interface or rule.
- **SECONDARY TRANSLATION/ANALYSIS:** useful for research but not accepted as controlling production evidence without the Arabic instrument and counsel validation.
- **STANDARD/EVIDENCE:** non-Egyptian technical/clinical benchmark; not Egyptian law.
- **SHIFAA POLICY:** a conservative product control selected for safety/security.
- **OPEN:** no authoritative public answer was found or contract-specific evidence is missing.

## 2. Personal data protection

### 2.1 Verified baseline

| Proposition | Classification | Source and implementation consequence |
|---|---|---|
| Electronic health, biometric, financial, and all children’s data are sensitive personal data. | LAW — article mapping provisional | Law 151/2020 definitions/Article 12 as read in an [Arabic Gazette scan archived by Manshurat](https://manshurat.org/node/66932) and an [unofficial English translation](https://eg.andersen.com/wp-content/uploads/2025/06/Law-No.-151-OF-2020.pdf). OPEN-LEGAL-007 requires the controlling/certified Arabic text and counsel mapping before this becomes release evidence. Sensitive processing remains production-gated. |
| Controllers/processors require a license or permit and a legal entity appoints/registers a DPO. | LAW — article mapping provisional | Law Articles 4–9 and 12 in the same research copies. Production evidence must include SHIFAA/entity role, processor contracts, license/permit, DPO registration, and the OPEN-LEGAL-007 counsel memo; technical controls alone are not authorization. |
| Breach notification is due to the PDPC within 72 hours of awareness; affected subjects are notified within three working days from the regulator notification. | LAW — article mapping provisional | Law Article 7 in the same research copies. Incident tooling retains awareness, regulator-notification, and subject-notification timestamps; OPEN-LEGAL-007 validates the legal calculation. |
| Cross-border storage/processing is not automatically allowed by consent. Adequate protection and PDPC license/authorization are the general rule; Article 15 contains limited exceptions. | LAW — article mapping provisional | Law Articles 14–16 in the same research copies. Routine foreign cloud hosting is not converted into an emergency exception; OPEN-LEGAL-001/007 obtain the controlling authorization and counsel mapping. |
| Executive Regulations were issued under Ministerial Decision 816/2025. | OFFICIAL STATUS; exact obligations OPEN | Current PDPC official guidance expressly refers to the Executive Regulations issued by Decision 816/2025, including the [consent guideline](https://pdpc.gov.eg/assets/pdf-data/Guidelines/DSConsent.pdf). Public English renderings are secondary. OPEN-LEGAL-007 must archive the controlling Arabic Gazette instrument and map licensing, transfer, DPO, security, rights, transition, and deadline rules before production. SHIFAA does not rely on an assumed grace period. |
| Consent must be explicit, informed, specific, freely given, granular, and written/electronic for sensitive data; the request is Arabic-first and withdrawal is easy. | REGULATOR GUIDANCE | PDPC [Data Subject Consent guideline](https://pdpc.gov.eg/assets/pdf-data/Guidelines/DSConsent.pdf). No prechecked, bundled, or dark-pattern consent. |
| A privacy notice identifies controller/DPO, data, lawful basis, purposes, recipients, transfers/countries, retention/criteria, rights, sources, and PDPC complaint path; Arabic is primary. | REGULATOR GUIDANCE | PDPC [Privacy Notice guideline](https://pdpc.gov.eg/assets/pdf-data/Guidelines/Privacy%20Notice.pdf). Notices are versioned per locale/purpose. |
| Healthcare/healthtech can require higher DPO capability, and final category is at PDPC discretion. | REGULATOR GUIDANCE | PDPC [DPO category framework](https://pdpc.gov.eg/assets/pdf-data/Guidelines/DPOC.pdf). SHIFAA does not self-declare a category; OPEN-LEGAL-001 obtains the PDPC determination. |

The [State Information Service announcement](https://sis.gov.eg/en/media-center/news/sisi-endorses-law-on-personal-data-protection/) confirms enactment of Law 151/2020. The PDPC site/guidelines show that earlier documentation describing the Center as merely future or unestablished is obsolete. The non-official hosting/translation links above are research aids, not substitutes for OPEN-LEGAL-007 evidence.

### 2.2 Required controls

- Maintain an approved record of processing with purpose, lawful basis, data classes, recipients/processors, destination countries, retention class, security, and owner.
- Collect consent only when consent is the selected lawful basis or separately needed; do not falsely represent consent as the only lawful basis for every care operation.
- Encrypt identity proof and designated sensitive fields, minimize vendor payloads, and prohibit PHI in logs/analytics.
- Provide access/export, correction, restriction/objection where applicable, withdrawal, and erasure/pseudonymization assessment. Clinical/legal retention and integrity may lawfully limit deletion; the decision is reasoned and auditable.
- Treat IP address/device evidence as personal data and retain only the approved minimum.
- No production PHI enters development, preview, analytics, model training, or foreign services outside the approved inventory.

### 2.3 Open legal determinations

No authoritative source located in this review established one general retention duration for all Egyptian medical records. The law requires purpose-duration/deletion and notice of retention, but domain statutes/facility rules may impose longer records. OPEN-LEGAL-002 therefore blocks production retention automation.

Managed Supabase’s [published regions](https://supabase.com/docs/guides/platform/regions) do not include Egypt; Supabase states that region selection/data residency is the customer’s responsibility in its [SOC 2 guidance](https://supabase.com/docs/guides/security/soc-2-compliance). Self-hosting is officially documented for compliance/control use cases in the [Supabase self-hosting guide](https://supabase.com/docs/guides/self-hosting). This supports the architectural option, but only PDPC/counsel evidence closes OPEN-LEGAL-001.

## 3. Pharmacy, prescriptions, and medicine traceability

### 3.1 EPTTS

| Proposition | Classification | Source and consequence |
|---|---|---|
| EDA established EPTTS across the pharmaceutical supply chain, with phased dates for imported and locally manufactured/repackaged finished products. | LAW/REGULATION | [EDA Decree 475/2025](https://edaegypt.gov.eg/media/o0hnfrts/475-2025_en.pdf). Implement versioned effective dates rather than one timeless boolean. |
| EDA issued the associated regulatory guideline for pharmaceutical establishments. | LAW/REGULATION | [EDA Decree 804/2025](https://edaegypt.gov.eg/media/me5loqeg/804-2025_en2.pdf). Facility applicability and current phase must be verified for the operating pharmacy. |
| The smallest saleable/dispensed secondary pack carries GS1 DataMatrix ECC200 with GTIN `(01)`, serial `(21)`, expiry `(17)`, and batch `(10)`. | REGULATOR GUIDANCE | EDA [EPTTS Technical FAQ v3, 23 Apr 2026](https://edaegypt.gov.eg/media/fs1folht/egyptian-track-trace-for-pharmaceutical-eptts-technical-faq-v3_20262.pdf). Scanner parser/test vectors use these AIs. |
| Phase 1 uses mandatory CSV/file procedures and has no API; EDA says API/system integration will come in future phases. | REGULATOR GUIDANCE | Same FAQ, Integration Roadmap. SHIFAA implements a file/manual adapter and cannot claim live EDA verification. |
| Aggregation/disaggregation and partial receipt are distinct supply-chain events. | REGULATOR GUIDANCE | Same FAQ. A representative-unit scan plus quantity cannot fabricate per-pack serial records. |

Receiving and dispense are operationally distinct SHIFAA events. The public FAQ does not, by itself, prove every private retail-pharmacy event/reporting detail; the exact EPTTS obligations of each facility and phase remain part of OPEN-LEGAL-003.

### 3.2 Pharmacy practice

The EDA-hosted [Pharmacy Profession Law 127/1955 translation](https://www.edaegypt.gov.eg/media/4d5hhv1f/pharmacy-law-127-1955-translated.pdf) states:

- Article 19: a pharmaceutical institution is managed by a qualified pharmacist and its director may not manage more than one institution.
- Article 30: a pharmacist ownership/partnership limit is expressed separately (the published translation says no more than two pharmacies).
- Articles 32–37 contain prescription, compounding, dispensing, and record-book rules, including licensed prescriber requirements and contemporaneous records.

The former statement “one pharmacist account maps to exactly one pharmacy, per Law 127/1955” was overbroad. SHIFAA prevents more than one active *directorship recorded inside SHIFAA* and requires external/manual evidence before activation; it cannot infer that no outside institution exists. Other lawful memberships/ownership facts are reviewed separately.

The EDA [laws and regulations page](https://www.edaegypt.gov.eg/en/the-regulatory-reference-of-the-egyptian-drug-authority-eda/laws-and-executive-regulations/) lists Pharmacy Law 127/1955, Narcotics Law 182/1960, and current schedule instruments including MoHP Decree 44/2026. Public sources reviewed did not specify a complete production electronic controlled-drug workflow. SHIFAA therefore preserves a separate, no-auto-refill path and treats its digital record as supplemental until OPEN-LEGAL-003 and OPEN-CLIN-002 close.

### 3.3 Electronic prescriptions

EDA’s October 2025 [digital-prescription project update](https://edaegypt.gov.eg/en/media-center/news/eda-explores-mechanisms-for-implementing-the-digital-prescription-system/) describes coordination and implementation mechanisms being developed. EHA reports [42 million electronic prescriptions and 4.5 million electronic health records](https://eha.gov.eg/en/news/highlights-transformation/) within UHI governorates. These official status statements prove real digital operations, but neither publishes a national third-party production API or establishes that SHIFAA may issue a legally substitutive prescription. The architecture therefore supplies an adapter boundary and explicit authority gate.

## 4. Disability card, identity, UHI, and payments

### 4.1 Disability Identification and Integrated Services Card

The Ministry of Social Solidarity describes the card as official proof of disability/degree and says it is recognized by government and non-government entities under Law 10/2018 on the [service page](https://www.moss.gov.eg/%D8%A7%D9%84%D8%AE%D8%AF%D9%85%D8%A7%D8%AA/%D8%A7%D9%84%D8%A3%D8%B4%D8%AE%D8%A7%D8%B5-%D8%B0%D9%88%D9%8A-%D8%A7%D9%84%D8%A7%D8%B9%D8%A7%D9%82%D8%A9/%D8%A7%D9%84%D8%A5%D8%AF%D8%A7%D8%B1%D8%A9-%D8%A7%D9%84%D8%B9%D8%A7%D9%85%D8%A9-%D9%84%D9%84%D8%AA%D8%B3%D8%AC%D9%8A%D9%84-%D9%88%D8%A7%D9%84%D8%AA%D9%88%D8%AC%D9%8A%D9%87-%D8%A3%D9%88%D9%84%D8%A7-%D8%A8%D8%B7%D8%A7%D9%82%D8%A9-%D8%A5%D8%AB%D8%A8%D8%A7%D8%AA-%D8%A7%D9%84%D8%A5%D8%B9%D8%A7%D9%82%D8%A9-%D9%88%D8%A7%D9%84%D8%AE%D8%AF%D9%85%D8%A7%D8%AA-%D8%A7%D9%84%D9%85%D8%AA%D9%83%D8%A7%D9%85%D9%84%D8%A9/). The official [card services portal](https://rdis.moss.gov.eg/EDR/OnlineRegistration/OnlineHome) lists benefits including free examination in hospitals.

The card is modeled as an entitlement credential, never a payment method. The exact benefit by facility (especially public versus private), current verification procedure, and absence/presence of an integration API remain OPEN-LEGAL-005. Staff cannot promise or automatically apply an unverified benefit.

### 4.2 National ID and Valify

Valify states that its Root of Trust verifies Egyptian National ID against the National Registry on its [official product site](https://valify.me/). Its [developer documentation](https://valify.gitbook.io/documentation) describes HTTPS/REST/OAuth-style credentials and provider transaction behavior. These are vendor claims, not a government delegation or SHIFAA contract. OPEN-VENDOR-001 requires commercial, DPA, security, residency, SLA, credential, and fallback evidence. National ID remains an encrypted proofing attribute rather than a username.

### 4.3 UHI

UHI digital activity is real in participating governorates, as the EHA source above demonstrates. No authoritative public third-party eligibility/claim API was identified in this review. Insurance integration stays outside MVP; UI must not accept self-declared coverage as verified eligibility.

### 4.4 Payments

The Central Bank of Egypt states on its [payment-systems oversight page](https://www.cbe.org.eg/en/payment-systems-and-services/payment-systems-and-services-oversight) that it licenses/oversees payment-system operators and providers under the Banking and Central Bank Law 194/2020. SHIFAA policy is to use a verified CBE-licensed PSP’s hosted/tokenized flow, never store PAN/CVV, and never custody funds. Care-payment PSP selection remains `OPEN-VENDOR-003`. Donations are outside graduation scope; ADR-016 permits post-graduation re-entry only through an executed licensed-partner/PSP model in which SHIFAA never collects or holds funds.

## 5. Clinical safety and emergency disclosure

### 5.1 Drug interaction alerts

The U.S. Health IT SAFER guide on [high-priority practices](https://www.healthit.gov/sites/default/files/playbook/pdf/4-high-priorities-final.pdf) supports severity-configurable drug-interaction checking and documented override rationale. Evidence also shows the tradeoff:

- a randomized trial of a near-hard stop prevented a dangerous interaction but produced unintended treatment delays ([JAMA Internal Medicine](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/226004));
- observational evidence supports severity tiering and shows alert burden affects acceptance ([PMC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6206354/));
- structured override reasons and pharmacist involvement improve reviewability ([PMC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6748816/)).

These sources are clinical/technical evidence, not Egyptian protocol. SHIFAA’s three tiers, dual governed contraindicated override, immutable evidence, and emergency exception are **SHIFAA POLICY** requiring Egyptian Medical Director/Clinical Pharmacist approval under OPEN-CLIN-001/002.

FHIR R4’s official [`MedicationRequest.detectedIssue`](https://hl7.org/fhir/R4/medicationrequest-definitions.html) and provenance semantics are used for consistent vocabulary. SHIFAA does not claim national FHIR conformance or certification.

### 5.2 Emergency Contacts

The Egyptian Health Council’s [medical ethics charter](https://www.ehc.gov.eg/ethics-medicine) states in Article 21 that the patient may restrict which people are informed, and Article 30 protects patient secrets except judicial, serious-certain-harm, or other legal cases. PDPL adds purpose, consent, sensitive-data, and minimization obligations.

HIPAA is not applicable Egyptian law. HHS guidance is used only as a conservative benchmark: emergency family notification may be limited to location and general condition, and disclosures should be minimum necessary ([HHS family notification](https://www.hhs.gov/hipaa/for-professionals/faq/491/may-a-doctor-disclose-information-to-a-person-that-can-notify-a-patients-family/index.html), [minimum necessary](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html)). SHIFAA therefore sends Emergency Contacts only an active life-safety SOS notice with the minimum fields; lab, drug-interaction, medication, and routine-admission events are prohibited.

### 5.3 Egyptian ambulance instruction

The Egyptian Ambulance Organization’s [official site and FAQ](https://eao.gov.eg/faq), the Egyptian Health Council’s [first-aid guidance](https://lms.ehc.gov.eg/lms/mod/book/view.php?chapterid=2482&id=454), and the National Telecom Regulatory Authority’s [official emergency-number list](https://www.tra.gov.eg/ar/atrc-faq/important-telephone-numbers/) identify `123` as the ambulance hotline. SHIFAA displays “Call ambulance 123” when no qualifying fresh hospital-capacity signal exists. It does not imply that SHIFAA called, dispatched, or reserved an ambulance.

## 6. Accessibility, language, and security standards

| Control | Classification | Source/use |
|---|---|---|
| WCAG 2.2 AA across web/mobile-equivalent behavior | STANDARD + SHIFAA POLICY | [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/). Full keyboard/screen-reader support is MVP, not deferred. |
| OpenAPI 3.1.1 contract | STANDARD | [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html). One machine-readable REST contract. |
| Problem Details | STANDARD | [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html). One error schema. |
| RLS default deny and forced RLS | STANDARD/TECHNICAL | [PostgreSQL row-security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) and [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Avoid owner/`BYPASSRLS` online roles and stale JWT authorization. |
| MFA enforcement | STANDARD/TECHNICAL | [Supabase MFA documentation](https://supabase.com/docs/guides/auth/auth-mfa) plus [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html). Passkeys are preferred for phishing resistance; OTP is not represented as phishing-resistant. |
| Field encryption approach | TECHNICAL | Supabase says [`pgsodium` is pending deprecation](https://supabase.com/docs/guides/database/extensions/pgsodium). SHIFAA uses application envelope encryption + distinct HMAC blind index. |
| Health app security testing | SHIFAA POLICY | OWASP ASVS L2 generally and applicable L3 for sensitive paths; OWASP API Security Top 10 test cases. These are assurance baselines, not Egyptian legal certificates. |

## 7. Production authorization checklist

No real patient data or regulated transaction is enabled until the applicable row has a dated evidence link and signers:

| Gate | Required evidence |
|---|---|
| PDPC/DPO | controller/processor classification, licenses/permits, registered DPO/category, processing inventory |
| Hosting/transfers | approved Egypt-resident topology or PDPC cross-border authorization, countries, processors/subprocessors, DPAs |
| Retention | signed per-class schedule and deletion/legal-hold procedure |
| Facilities/professionals | current license verification procedures and reviewer evidence |
| Clinical content | physician + clinical pharmacist signatures, versioned rules and test vectors |
| Controlled medicines/eRx | authority/counsel workflow, current schedule, original/register rules, approved electronic status |
| EPTTS | facility applicability, current EDA format/version, operational SOP and evidence |
| Lab/vaccine | approved thresholds/schedules/escalation and named directors/reviewers |
| Valify/SMS/maps/AI | signed DPA/security/residency/SLA, credentials, data-minimization, fallback/kill switch |
| Care payments | CBE-licensed PSP evidence and hosted/tokenized integration |
| Post-MVP donation re-entry | Executed licensed Egyptian fundraising/care-finance partner and CBE-licensed PSP agreement; partner owns collection, AML/KYC, custody, receipts, and disbursement; new dated scope ADR |
| Disability entitlement | official verification and facility-benefit applicability |
| Security/reliability | threat model, penetration/access tests, backup restore, incident/breach tabletop |

## 8. Research limitations and update rule

This review used publicly accessible sources checked through 2026-08-09. It did not obtain private regulator circulars, certified Gazette copies, facility-specific policies, vendor contracts, or legal opinions. Absence of a public API/rule is not proof that none exists; the applicable open item therefore requires direct written evidence. DPO/legal/clinical owners re-check sources before each regulated feature release and at least quarterly, recording access date and any superseding instrument.
