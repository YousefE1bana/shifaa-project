/* TEST-ONLY static composition. No API, Auth, application imports or mutations. */
const text = {
  candidate:['مرجع مرشح للاختبار فقط — بيانات اصطناعية','TEST-ONLY candidate — synthetic data'],
  notice:['لا تمثل هذه البيانات محتوى طبيًا معتمدًا. المرجع ينتظر مراجعة مالك المنتج.','These fixtures are not approved medical content. This reference awaits Product Owner review.'],
  statusRefresh:['تم تحديث الحالة من المصدر المصرح','Status refreshed from the authorized source'],
  newAssertion:['سجل جديد','New assertion'],
  initialOnly:['غياب السابق صالح للإصدار الأول فقط؛ البدائل اللاحقة تستبدل المطبق صراحةً.','No predecessor is valid only for the first release; later replacements explicitly supersede the applicable release.'],
  records:['السجل: الحساسية','Records: allergies'], summary:['ملخص المريض: الحساسية','Patient summary: allergies'],
  contentStatus:['حالة المحتوى المنشور','Published content status'], governance:['حوكمة المحتوى','Content governance'],
  self:['مريض تجريبي أ · نفسك','Synthetic patient A · self'], guardian:['مريض تجريبي ب · ولي أمر · قراءة مصرح بها فقط','Synthetic patient B · guardian · authorized read only'],
  delegate:['مريض تجريبي ب · مفوّض · قراءة مصرح بها فقط','Synthetic patient B · delegate · authorized read only'],
  careContext:['مريض تجريبي أ · سياق زيارة مصرح به من الميزة 010','Synthetic patient A · authorized Feature 010 encounter context'],
  facility:['منشأة تجريبية · صلاحية حالية · مستوى تحقق AAL2','Synthetic facility · current authority · AAL2'],
  medicalAdmin:['مسؤول طبي · صلاحية إنشاء/نشر منفصلة','Medical admin · separate create/publish authority'],
  statusReader:['قارئ حالة مصرح له · غرض مصرح · منشأة حالية','Authorized status reader · authorized purpose · current facility'],
  assignedOnly:['مراجعة العنصر المعيّن فقط · دون صلاحيات إدارة/إنشاء/نشر','Assigned item review only · no admin/create/publish authority'],
  physician:['طبيب تجريبي أ · أهلية مهنية متحققة وتعيين موثّق','Synthetic physician A · verified eligibility and evidenced designation'],
  pharmacist:['صيدلي تجريبي ب · أهلية مهنية متحققة وتعيين موثّق','Synthetic pharmacist B · verified eligibility and evidenced designation'],
  purpose:['الغرض','Purpose'], purposeCare:['رعاية مصرح بها','Authorized care'], purposeGovernance:['مراجعة حوكمة مصرح بها','Authorized governance review'],
  choosePerson:['تغيير الشخص','Switch person'], current:['محدّث · ١ أكتوبر ٢٠٢٦، ١٢:٠٠ (القاهرة)','Current · 1 October 2026, 12:00 (Cairo)'],
  old:['قد يكون قديمًا · آخر تحديث: ١ أكتوبر ٢٠٢٦، ١١:٥٥ (القاهرة)','May be outdated · last updated: 1 October 2026, 11:55 (Cairo)'],
  currentLater:['محدّث · ٩ أكتوبر ٢٠٢٦، ١٢:٠٠ (القاهرة) · ساعة السيناريو الاصطناعي','Current · 9 October 2026, 12:00 (Cairo) · synthetic scenario clock'],
  unavailable:['المعلومات محجوبة حتى إعادة التحقق من الصلاحية والحداثة.','Information is hidden until current authority and freshness are rechecked.'],
  loading:['جارٍ التحميل','Loading'], empty:['لا توجد بيانات متاحة','No available data'],
  emptyAllergy:['عدم وجود سجل متاح لا يعني عدم وجود حساسية.','No available record does not mean the patient has no allergies.'],
  emptyContent:['لا توجد إصدارات منشورة متاحة؛ لا يُستنتج الأمان.','No published releases are available; no safety conclusion follows.'],
  'error-recoverable':['تعذر التحميل؛ يمكنك إعادة المحاولة','Could not load; retry is available'],
  'error-terminal':['المعلومات غير متاحة الآن؛ لا يوجد بديل آمن مفترض','Information is unavailable; no assumed safe fallback'],
  'permission-denied':['لا توجد صلاحية لهذا العرض','This view is not authorized'],
  offline:['دون اتصال؛ الإجراءات غير متاحة ولن تُحفظ في طابور','Offline; actions are unavailable and will not be queued'],
  stale:['قد تكون البيانات قديمة؛ حدّث وراجع قبل الإجراء','Data may be stale; refresh and review before acting'],
  success:['تم الإجراء في بيئة الاختبار ونُسب إلى صاحبه','Test action completed with attributable evidence'],
  'allergy-self-reported':['إبلاغ ذاتي — غير مؤكد سريريًا','Self-reported — not clinically confirmed'],
  'allergy-confirmed':['مؤكدة بواسطة طبيب — حالة اصطناعية','Clinician-confirmed — synthetic state'],
  'allergy-refuted':['منفية بواسطة طبيب — السجل محفوظ','Refuted by clinician — history retained'],
  'allergy-entered-in-error':['أُدخلت بالخطأ — حالة نهائية لهذا السجل','Entered in error — terminal for this record'],
  'unknown-fields':['قيم غير معروفة صراحةً','Explicitly unknown values'],
  'report-form':['إبلاغ عن حساسية لنفسك','Report an allergy for yourself'],
  'report-review':['مراجعة الإبلاغ قبل الحفظ','Review the report before saving'],
  submitting:['جارٍ حفظ الإبلاغ؛ لا ترسل طلبًا آخر','Saving the report; do not submit again'],
  history:['تاريخ إصدارات كامل — دون محو','Complete version history — no erasure'],
  'correction-link':['إبلاغ مصحح جديد مرتبط بالسجل الخاطئ','New corrected report linked to the erroneous record'],
  'guardian-read-only':['عرض ولي الأمر: قراءة فقط وفق الصلاحية القائمة','Guardian view: read only under existing authority'],
  'delegate-read-only':['عرض المفوّض: قراءة فقط وفق الصلاحية القائمة','Delegate view: read only under existing authority'],
  conflict:['تعارض في الإصدار أو مفتاح الطلب؛ يلزم تحديث ومراجعة','Version or request-key conflict; refresh and review'],
  'receipt-reconciliation':['نتيجة الإرسال غير مؤكدة؛ تحقق بنفس مفتاح الطلب والبيانات','Transport outcome is uncertain; reconcile with the same key and bindings'],
  'authority-lost':['فُقدت الصلاحية؛ أُوقف الوصول والإجراء','Authority was lost; access and action are stopped'],
  'create-form':['تسجيل الطبيب يبدأ بإبلاغ ذاتي','Clinician creation starts as self-reported'],
  'verify-confirm-review':['تأكيد سريري بإصدار وأدلة جديدة','Confirm with a new version and attributable evidence'],
  'verify-refute-review':['نفي بإصدار وأدلة جديدة','Refute with a new version and attributable evidence'],
  'verify-revision-review':['تغيير حالة متحققة مع حفظ كل الأدلة السابقة','Revise a verified state while retaining all earlier evidence'],
  'entered-in-error-review':['تأكيد إدخال السجل بالخطأ — إجراء نهائي','Confirm entered-in-error — terminal action'],
  'correction-review':['إنشاء إبلاغ مصحح جديد؛ السجل الخاطئ لا يُعاد فتحه','Create a new corrected report; the erroneous record is not reopened'],
  'context-ended':['انتهى سياق الزيارة؛ أعد التحقق من صلاحية الرعاية','Encounter context ended; recheck current care authority'],
  'aal2-required':['يلزم تحقق AAL2 وغرض وصلاحية حالية','AAL2, purpose and current authority are required'],
  effective:['منشور وساري في بيئة الاختبار فقط','Published and effective in the test environment only'],
  published:['منشور في بيئة الاختبار فقط','Published in the test environment only'],
  sourceSynthetic:['مصدر اصطناعي محايد أ','Neutral synthetic source A'],
  'future-effective':['منشور بتاريخ سريان مستقبلي — غير مؤهل الآن','Published with a future effective date — ineligible now'],
  superseded:['إصدار سابق مستبدل — التاريخ محفوظ','Prior superseded release — history retained'],
  'synthetic-gated':['اصطناعي فقط؛ الاستخدام الطبي الحقيقي محكوم ببوابات مفتوحة','Synthetic only; real clinical use remains gated'],
  'dependency-unavailable':['تعذر التحقق من المصدر المعتمد؛ العرض غير متاح','Authoritative dependency unavailable; view unavailable'],
  draft:['مسودة غير موقّعة — لا تؤثر في القرارات','Unsigned draft — cannot affect decisions'],
  'create-review':['مراجعة الإنشاء؛ يبدأ العنصر كسجل غير متحقق أو مسودة','Review creation; the item starts unverified or as a draft'],
  'initial-release':['إصدار أول صريح؛ لا يوجد سابق لهذه السلسلة','Explicit initial release; no predecessor in this series'],
  'assigned-physician-review':['مراجعة الطبيب للعنصر المعيّن','Physician review of the assigned item'],
  'assigned-pharmacist-review':['مراجعة الصيدلي للعنصر المعيّن','Pharmacist review of the assigned item'],
  'signature-review':['تأكيد توقيع على نسخة وبصمة ثابتتين','Confirm a signature on the exact immutable version and digest'],
  'physician-signed':['توقيع الطبيب موجود؛ توقيع الصيدلي المستقل مطلوب','Physician signed; independent pharmacist approval is still required'],
  'pharmacist-signed':['توقيع الصيدلي موجود؛ توقيع الطبيب المستقل مطلوب','Pharmacist signed; independent physician approval is still required'],
  'signatures-complete':['موافقتان مستقلتان؛ النشر إجراء منفصل','Two independent approvals; publication is a separate action'],
  rejected:['قرار مراجعة بالرفض — غير صالح للنشر','Review rejected — not publishable'],
  'qualification-unresolved':['الأهلية أو تعيين الصفة غير مثبت؛ التوقيع ممنوع','Eligibility or required-capacity designation unresolved; signing denied'],
  'self-approval-denied':['المنشئ لا يوقّع أو ينشر عمله بنفسه','The creator cannot sign or publish their own work'],
  'duty-conflict':['تعارض استقلال الأشخاص؛ النشر ممنوع','Person independence conflict; publication denied'],
  'digest-conflict':['النسخة أو البصمة لا تطابق العنصر المُراجع','Version or digest does not match the reviewed artifact'],
  'version-conflict':['تغيّر إصدار سير العمل؛ حدّثه وراجع مجددًا','Workflow version changed; refresh and review again'],
  'publish-review':['مراجعة النشر المستقل والسريان والاستبدال','Review independent publication, effective date and supersession'],
  'published-effective':['منشور وساري اصطناعيًا؛ ليس اعتمادًا طبيًا حقيقيًا','Published and synthetically effective; not real clinical approval'],
  'supersession-review':['استبدال صريح للإصدار المطبق من نفس المحتوى','Explicitly supersede the applicable release of the same content'],
  'rollback-review':['تراجع بإصدار جديد وتوقيعين جديدين','Rollback through a new release and two new approvals'],
  'overlap-conflict':['تداخل أو خلفاء متنافسون؛ النشر ممنوع','Ambiguous overlap or competing successors; publication denied'],
  'real-content-gated':['محتوى حقيقي غير معتمد؛ النشر/الأهلية ممنوعان','Real content is unapproved; publication/eligibility denied'],
  unknown:['غير معروف','Unknown'], substance:['المادة / الاسم المعروض','Substance / display'], source:['المصدر','Source'],
  syntheticSubstance:['مادة اصطناعية أ — ليست مادة طبية حقيقية','Synthetic substance A — not a real medical substance'],
  sourcePatient:['إبلاغ المريض الاصطناعي','Synthetic patient report'], sourceClinician:['تسجيل طبيب مصرح له','Authorized clinician recording'],
  coding:['الترميز المتحقق','Validated coding'], reaction:['التفاعل','Reaction'], severity:['الشدة','Severity'], onset:['بداية الأعراض','Onset'],
  unknownHint:['يُستخدم رمز متحقق إذا كان متاحًا؛ القيم المفقودة لا تُخمن.','Use a validated code when available; never guess missing values.'],
  recorder:['المُسجّل','Recorder'], verifier:['المتحقق','Verifier'], reason:['سبب جديد','New reason'], evidence:['أدلة منسوبة لصاحبها','Attributable evidence'],
  fixtureReason:['سبب دليل اصطناعي محايد — دون ادعاء طبي','Neutral synthetic provenance reason — no medical claim'],
  fixtureEvidence:['مرجع دليل اختباري منسوب إلى الطبيب التجريبي','Test evidence reference attributable to the synthetic clinician'],
  version:['الإصدار','Version'], artifactVersion:['نسخة العنصر الثابتة','Immutable artifact version'], workflowVersion:['إصدار سير العمل المتغير','Mutable workflow version'],
  digest:['بصمة العنصر','Artifact digest'], effectiveDate:['تاريخ السريان','Effective date'], publication:['حالة النشر','Publication state'], eligibility:['الأهلية الزمنية','Temporal eligibility'], lineage:['سلسلة الاستبدال','Supersession lineage'],
  initial:['الأول؛ لا يوجد سابق','Initial; no predecessor'], successor:['يستبدل الإصدار السابق صراحةً','Explicitly supersedes the prior release'],
  futureHint:['الإصدار السابق هو المطبق حتى تاريخ السريان؛ المنشور المستقبلي لا يؤثر الآن.','The prior release remains applicable until the effective date; the future publication has no effect now.'],
  draftHint:['المسودة أو الموافقة الناقصة لا تؤثر في القرارات.','Drafts or incomplete approvals cannot affect decisions.'],
  terminalHint:['هذه الحالة نهائية. التصحيح سجل جديد مرتبط يبدأ بإبلاغ ذاتي.','This state is terminal. Correction requires a linked new record starting as self-reported.'],
  revisionsHint:['التأكيد والنفي يتبادلان بإصدار وسبب وأدلة جديدة؛ لا عودة إلى إبلاغ ذاتي.','Confirmation and refutation may change with a new version, reason and evidence; no reset to self-reported.'],
  formHint:['المادة والمصدر مطلوبان. إنشاء الطبيب لا يُعد تحققًا سريريًا.','Substance and source are required. Clinician creation is not clinical verification.'],
  creationStatus:['الحالة عند الإنشاء: إبلاغ ذاتي','Initial status: self-reported'], correction:['ارتباط التصحيح','Correction linkage'],
  historyTitle:['سجل الأدلة والإصدارات','Evidence and version history'],
  report:['إبلاغ عن حساسية','Report allergy'], verify:['مراجعة التحقق','Review verification'], correct:['إنشاء سجل مصحح مرتبط','Create linked correction'],
  refresh:['تحديث وإعادة المراجعة','Refresh and review'], retry:['إعادة المحاولة','Retry'], cancel:['إلغاء','Cancel'],
  reportAllergy:['إرسال إبلاغ الحساسية','Submit allergy report'],
  createAllergy:['إنشاء سجل حساسية','Create allergy record'],
  confirmAllergy:['تأكيد الحساسية سريريًا','Confirm allergy clinically'],
  refuteAllergy:['نفي الحساسية','Refute allergy'],
  markError:['وَسْم السجل بأنه أُدخل بالخطأ','Mark record entered in error'],
  correctedAssertion:['إنشاء سجل حساسية مصحح مرتبط','Create linked corrected allergy assertion'],
  createDraft:['إنشاء مسودة محتوى سريري','Create clinical-content draft'],
  signExact:['توقيع الإصدار المحدد','Sign exact release'],
  publishRelease:['نشر الإصدار','Publish release'],
  publishSuccessor:['نشر الإصدار البديل','Publish superseding release'],
  publishRollback:['نشر إصدار التراجع الجديد','Publish new rollback release'],
  sign:['مراجعة التوقيع المعيّن','Review assigned signature'], publish:['مراجعة النشر','Review publication'], create:['مراجعة إنشاء مسودة','Review draft creation'],
  reconcile:['التحقق من النتيجة الأصلية','Reconcile original result'], next:['الخطوة التالية: مراجعة السجل المحدّث','Next: review the updated record'],
  receipt:['مرجع النتيجة','Result reference'], time:['وقت النتيجة','Result time'], creator:['المنشئ','Creator'], publisher:['الناشر المستقل','Independent publisher'],
  approved:['موافقة اصطناعية منسوبة لصاحبها','Attributable synthetic approval'], pending:['مطلوبة؛ لم تكتمل','Required; not complete'],
  physicianCapacity:['طبيب أول / مدير طبي — تعيين مثبت في السيناريو الاختباري','Senior physician / medical director — evidenced test designation'],
  pharmacistCapacity:['صيدلي سريري — تعيين مثبت في السيناريو الاختباري','Clinical pharmacist — evidenced test designation'],
  currentGrant:['صلاحية توقيع حالية مستقلة عن صلاحيات الإدارة','Current signing authority independent of admin privileges'],
  bundle:['عنصر محايد + أدلة الكود + متجهات اختبار محايدة','Neutral artifact + code evidence + neutral test vectors'],
  contentPlaceholder:['عنصر اصطناعي محايد. لا قواعد أو توصيات أو نصوص طبية.','Neutral synthetic artifact. No medical rules, recommendations or clinical body text.'],
  independence:['الطبيب والصيدلي شخصان مستقلان؛ المنشئ والناشر مختلفان.','Physician and pharmacist are different people; creator and publisher are distinct.'],
  qualificationHint:['غياب الأهلية أو تعيين الصفة أو فقدان الصلاحية يمنع الإجراء.','Missing eligibility/designation or authority loss denies the action.'],
  rollbackHint:['لا تعديل للتاريخ ولا إعادة استخدام توقيعات قديمة؛ إصدار جديد يستبدل المطبق.','No history rewrite or reused old signatures; a new release supersedes the applicable one.'],
  clinicalGate:['OPEN-CLIN-001 مفتوحة؛ لا اعتماد لمحتوى حقيقي أو لمؤهلات حقيقية.','OPEN-CLIN-001 remains open; no approval of real content or real professional qualifications.'],
  clinicalHidden:['لا تُعرض أجسام المحتوى أو المسودات أو هويات الموقّعين.','No content bodies, drafts or signer identities are exposed.'],
  signatureMinimum:['المراجعتان المستقلتان مكتملتان — حالة فقط','Independent reviews complete — status only'],
  noQueue:['لا إجراءات مؤجلة دون اتصال. يجب إعادة التحقق بعد الاتصال.','No offline mutation queue. Reauthorize after reconnecting.'],
  subjectHidden:['سياق المريض محجوب','Patient context hidden'], contextHidden:['السياق المحمي محجوب','Protected context hidden'],
  controlsDemo:['عناصر عرض فقط؛ غير متصلة بأي خدمة','Display controls only; not connected to any service'],
  freshnessUnknown:['الحداثة غير معروفة','Freshness unknown'], readOnly:['قراءة فقط','Read only'], noAuthority:['لا تُشتق أي صلاحية من العضوية وحدها','Membership alone grants no authority'],
  notApproved:['مرشح غير معتمد · OPEN-UX-001/002 مفتوحتان','Unapproved candidate · OPEN-UX-001/002 remain open'],
  statusNotSafety:['حالة حوكمة فقط؛ ليست تقييمًا للسلامة','Governance status only; not a safety evaluation'],
};

const params = new URLSearchParams(location.search);
const locale = params.get('locale') || 'ar-EG';
if (!['ar-EG','en-EG'].includes(locale)) throw new Error('Unknown locale');
const t = key => { if (!text[key]) throw new Error(`Missing copy: ${key}`); return text[key][locale === 'ar-EG' ? 0 : 1]; };
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Exact values retain their original text; breaks occur only at token boundaries.
const iso = value => {
  const raw = String(value);
  let chunks;
  if (/^[a-f0-9]{64}$/.test(raw)) chunks = raw.match(/.{16}/g);
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(raw)) chunks = [raw.slice(0,10),raw.slice(10,19),raw.slice(19)];
  else chunks = raw.split(/(?<=[\-_/·\s])/u).filter(Boolean);
  return `<bdi dir="ltr" class="technical">${chunks.map(chunk=>`<span class="technical-chunk">${escape(chunk)}</span>`).join('<wbr>')}</bdi>`;
};
const readableDate = value => {
  const formatted = new Intl.DateTimeFormat(locale,{timeZone:'Africa/Cairo',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZoneName:'short'}).format(new Date(value));
  return `<time datetime="${escape(value)}"><bdi dir="${locale==='ar-EG'?'rtl':'ltr'}" class="localized-date">${escape(formatted)}</bdi></time>`;
};
const badge = (key,tone='info') => `<span class="badge ${tone}"><span aria-hidden="true">●</span>${t(key)}</span>`;
const pairs = rows => `<dl>${rows.map(([key,value]) => `<dt>${t(key)}</dt><dd>${value}</dd>`).join('')}</dl>`;
const button = (key, action, disabled=false, tone='', suffix='') => `<button type="button" class="${tone}" data-action="${action}" ${disabled?'disabled':''}>${t(key)}${suffix?' '+suffix:''}</button>`;
const card = (title,body,classes='') => `<section class="card ${classes}"><h2>${t(title)}</h2>${body}</section>`;
const field = (key,value,area=false) => `<div class="field"><label for="${key}">${t(key)}</label>${area?`<textarea id="${key}" readonly>${escape(value)}</textarea>`:`<input id="${key}" value="${escape(value)}" readonly>`}</div>`;

async function render() {
  const [inventory,fixture] = await Promise.all(['../baseline-inventory.json','fixture.json'].map(p=>fetch(p).then(r=>{if(!r.ok)throw new Error(p);return r.json();})));
  const route = inventory.routes.find(r=>r.baselineId === params.get('baseline')) || inventory.routes[0];
  const state = params.get('state') || route.states[0];
  if (!route.states.includes(state)) throw new Error('Unknown route/state');
  document.documentElement.lang=locale; document.documentElement.dir=locale==='ar-EG'?'rtl':'ltr';
  const patient=route.app==='patient', allergy=route.route!=='/clinical-content/status'&&route.app!=='admin';
  const statusOnly=route.route==='/clinical-content/status';
  const reviewer=route.app==='admin' && ['assigned-physician-review','assigned-pharmacist-review','signature-review','qualification-unresolved'].includes(state);
  const hidden=['loading','empty','permission-denied','authority-lost','context-ended','aal2-required','offline','stale','error-recoverable','error-terminal','dependency-unavailable'].includes(state);
  const title=patient?'records':allergy?'summary':statusOnly?'contentStatus':'governance';
  const context=hidden?t(patient||allergy?'subjectHidden':'contextHidden'):patient?t(state==='guardian-read-only'?'guardian':state==='delegate-read-only'?'delegate':'self'):allergy?t('careContext'):statusOnly?t('statusReader'):reviewer?t('assignedOnly'):t('medicalAdmin');
  const tone=['permission-denied','authority-lost','error-terminal','self-approval-denied','duty-conflict','digest-conflict','real-content-gated','overlap-conflict'].includes(state)?'danger':state==='success'?'success':'warning';
  const stateTitle=t(statusOnly&&state==='success'?'statusRefresh':state);
  let body='';
  if(hidden) {
    body = card(title,state==='loading'?`<div role="status" aria-live="polite">${t('loading')}</div><div class="skeleton"></div><div class="skeleton"></div>`:state==='empty'?`<p class="empty">${t(allergy?'emptyAllergy':'emptyContent')}</p>`:`<p>${t('unavailable')}</p><p>${t(state==='offline'?'noQueue':state==='aal2-required'?'noAuthority':'freshnessUnknown')}</p><div class="actions">${button(['error-recoverable','dependency-unavailable'].includes(state)?'retry':'refresh','read-refresh')}</div>`);
  } else if(allergy) {
    const selectedStatus={'allergy-confirmed':'allergy-confirmed','allergy-refuted':'allergy-refuted','allergy-entered-in-error':'allergy-entered-in-error',history:'allergy-refuted','entered-in-error-review':'allergy-confirmed','verify-revision-review':'allergy-refuted','correction-review':'allergy-entered-in-error'}[state]||'allergy-self-reported';
    const version=selectedStatus==='allergy-self-reported'?1:selectedStatus==='allergy-confirmed'?2:3;
    const sourceKey=patient?'sourcePatient':'sourceClinician';
    const data=pairs([['substance',t('syntheticSubstance')],['source',t(sourceKey)],['coding',t('unknown')],['reaction',t('unknown')],['severity',t('unknown')],['onset',t('unknown')],['version',iso(version)],['recorder',iso(patient?'TEST-PATIENT-A':'TEST-CLINICIAN-A')],['time',readableDate(version===1?'2026-10-01T11:40:00+03:00':version===2?'2026-10-01T11:45:00+03:00':'2026-10-01T11:50:00+03:00')],...(version>1?[['verifier',iso('TEST-CLINICIAN-A')],['evidence',iso('EVIDENCE-TEST-00'+version)]]:[])]);
    let controls='';
    if(!['guardian-read-only','delegate-read-only','receipt-reconciliation','submitting','conflict'].includes(state)) {
      controls=patient?button('report','createAllergy',false,'primary'):selectedStatus==='allergy-entered-in-error'?button('correct','createAllergy',false,'primary'):button('verify','verifyAllergy',false,'primary')+button('report','createAllergy');
    }
    body=card('substance',badge(selectedStatus,selectedStatus==='allergy-confirmed'?'success':selectedStatus==='allergy-entered-in-error'?'danger':'info')+data+`<p class="small">${t('unknownHint')}</p>`+(selectedStatus==='allergy-entered-in-error'?`<p class="review-note">${t('terminalHint')}</p>`:'')+`<div class="actions">${controls}</div>`);
    if(['report-form','create-form'].includes(state)) body+=card(state,`<p>${t('formHint')}</p><div class="fields">${field('substance',t('syntheticSubstance'))}${field('source',t(sourceKey))}${field('coding',t('unknown'))}${field('reaction',t('unknown'))}${field('severity',t('unknown'))}${field('onset',t('unknown'))}</div><p>${t('creationStatus')}</p><div class="actions">${button(patient?'reportAllergy':'createAllergy','createAllergy',false,'primary')}</div>`);
    if(['history','correction-link','correction-review'].includes(state)) body+=card('historyTitle',`<ol class="history"><li><strong>${iso('A-TEST-001 · v1')} ${t('allergy-self-reported')}</strong>${t('sourcePatient')} · ${iso('TEST-PATIENT-A')} · ${readableDate('2026-10-01T11:40:00+03:00')}</li><li><strong>${iso('A-TEST-001 · v2')} ${t('allergy-confirmed')}</strong>${iso('TEST-CLINICIAN-A · EVIDENCE-TEST-002')} · ${readableDate('2026-10-01T11:45:00+03:00')}</li><li><strong>${iso('A-TEST-001 · v3')} ${t(state==='history'?'allergy-refuted':'allergy-entered-in-error')}</strong>${t('fixtureReason')} · ${iso('TEST-CLINICIAN-A · EVIDENCE-TEST-003')} · ${readableDate('2026-10-01T11:50:00+03:00')}</li>${state!=='history'?`<li><strong>${iso('A-TEST-002 · v1')} ${t('allergy-self-reported')}</strong>${t('correction')}: ${iso('A-TEST-002 → A-TEST-001')}</li>`:''}</ol><p>${t(state==='history'?'revisionsHint':'terminalHint')}</p>`);
  } else if(statusOnly) {
    const future=state==='future-effective', prior=state==='superseded';
    body=card('contentStatus',pairs([['source',t('sourceSynthetic')],['version',iso(future?2:1)],['effectiveDate',readableDate(future?'2026-10-08T12:00:00+03:00':'2026-09-28T12:00:00+03:00')],['publication',t('published')],['eligibility',t(future?'future-effective':prior?'superseded':'effective')],['lineage',future?`${iso('REL-TEST-002 → REL-TEST-001')}`:prior?iso('REL-TEST-001 ← REL-TEST-002'):t('initial')]])+`<p>${t('signatureMinimum')}</p><p class="small">${t('clinicalHidden')}</p>`+(future?`<p class="review-note">${t('futureHint')}</p>`:''));
  } else {
    const isInitial=state==='initial-release', isFuture=state==='future-effective', isRollback=state==='rollback-review';
    const signed=['signatures-complete','publish-review','published-effective','future-effective','supersession-review','superseded'].includes(state);
    const published=['published-effective','future-effective','superseded'].includes(state);
    const release=isInitial||state==='superseded'?'REL-TEST-001':isRollback?'REL-TEST-003':'REL-TEST-002';
    const artifactVersion=isInitial||state==='superseded'?1:isRollback?3:2;
    const artifactDigest=fixture.artifacts[artifactVersion].digest;
    const workflowVersion=signed?3:['physician-signed','pharmacist-signed','assigned-pharmacist-review'].includes(state)?2:1;
    const metadata=pairs([['source',iso('TEST-NONCLINICAL-SOURCE-001')],['artifactVersion',iso(artifactVersion)],['workflowVersion',iso(workflowVersion)],['digest',iso(artifactDigest)],['effectiveDate',iso(isInitial||state==='superseded'?'2026-09-28T12:00:00+03:00':isRollback?'2026-10-10T12:00:00+03:00':'2026-10-08T12:00:00+03:00')],['lineage',isInitial||state==='superseded'?t('initial'):iso(isRollback?'REL-TEST-003 → REL-TEST-002':'REL-TEST-002 → REL-TEST-001')],...(!reviewer?[['creator',iso('TEST-CREATOR-C')],['publisher',published?iso('TEST-PUBLISHER-D'):t('pending')]]:[])]);
    const signState=(capacity)=>state==='rejected'&&capacity==='pharmacist'?'rejected':signed||(capacity==='physician'&&['physician-signed','assigned-pharmacist-review'].includes(state))||(capacity==='pharmacist'&&state==='pharmacist-signed')?'approved':'pending';
    body=card('governance',`<p class="mono">${iso(release)}</p>${metadata}<p>${t(published?isFuture?'futureHint':'statusNotSafety':'draftHint')}</p>`);
    body+=card('bundle',`<p>${t('contentPlaceholder')}</p><p class="mono">${iso('CODE-EVIDENCE-TEST-001 · TEST-VECTORS-NEUTRAL-001')}</p>`);
    if(state!=='qualification-unresolved')body+=card('historyTitle',`<p>${t('physicianCapacity')}</p>${badge(signState('physician'),signState('physician')==='approved'?'success':'warning')}${reviewer?'':`<p>${iso('TEST-PHYSICIAN-A')}</p>`}<p>${t('pharmacistCapacity')}</p>${badge(signState('pharmacist'),signState('pharmacist')==='approved'?'success':'warning')}${reviewer?'':`<p>${iso('TEST-PHARMACIST-B')}</p>`}<p class="review-note">${t('independence')}</p>`);
    if(reviewer) body+=card('assignedOnly',`<p>${t(state==='qualification-unresolved'?'qualification-unresolved':state==='assigned-pharmacist-review'?'pharmacist':'physician')}</p><p>${t('currentGrant')}</p><p>${t('qualificationHint')}</p><div class="actions">${button('sign','signClinicalContentRelease',state==='qualification-unresolved','primary')}</div>`);
    else if(!['authority-lost','self-approval-denied','duty-conflict','digest-conflict','version-conflict','overlap-conflict','real-content-gated','rejected','receipt-reconciliation'].includes(state)) body+=`<div class="actions">${button('create','createClinicalContentRelease')}${button('publish','publishClinicalContentRelease',!signed||published,'primary')}</div>`;
    if(isInitial)body+=`<p class="review-note">${t('initialOnly')}</p>`;
    if(state==='rejected')body+=card('evidence',`<p>${iso('TEST-PHARMACIST-B · REJECT-EVIDENCE-TEST-001')}</p><p>${t('fixtureReason')}</p>`);
    if(isRollback) body+=`<p class="review-note">${t('rollbackHint')}</p>`;
    if(state==='superseded')body+=`<p class="review-note">${iso('REL-TEST-001 → REL-TEST-002')} · ${t('history')}</p>`;
  }
  if(state==='receipt-reconciliation') body=card('receipt-reconciliation',`<p>${t('receipt-reconciliation')}</p><p class="small">${iso('REQUEST-TEST-011')}</p><div class="actions">${button('reconcile','reconcile-original',false,'primary')}</div>`);
  if(state==='conflict'||state==='version-conflict'||state==='digest-conflict'||state==='overlap-conflict')body=`<div class="banner danger"><strong>${stateTitle}</strong><p>${t('unavailable')}</p><div class="actions">${button('refresh','read-refresh')}</div></div>`;
  if(state==='submitting')body=`<section class="card" role="status" aria-live="polite"><h2>${stateTitle}</h2><p>${t('creationStatus')}</p><div class="actions">${button('report','createAllergy',true,'primary')}</div></section>`;
  if(state==='success'&&statusOnly) body+=`<p class="review-note">${t('next')}</p>`;
  if(state==='success'&&!statusOnly) body=`<section class="card" role="status" aria-live="polite"><h2>${stateTitle}</h2>${pairs([['receipt',iso(allergy?'A-TEST-001 · v1':'REL-TEST-002')],['time',allergy?readableDate('2026-10-01T12:00:00+03:00'):iso('2026-10-01T12:00:00+03:00')],['recorder',iso(patient?'TEST-PATIENT-A':allergy?'TEST-CLINICIAN-A':'TEST-PUBLISHER-D')]])}<p>${t(allergy?'creationStatus':'synthetic-gated')}</p><p>${t('next')}</p><div class="actions">${button('refresh','read-refresh')}</div></section>`;
  const reviewState=['report-review','create-review','verify-confirm-review','verify-refute-review','verify-revision-review','entered-in-error-review','correction-review','signature-review','publish-review','supersession-review','rollback-review'].includes(state);
  let dialog='';
  if(reviewState) {
    const isSign=state==='signature-review';
    const confirmKey=allergy
      ? state==='entered-in-error-review'?'markError'
        : state==='correction-review'?'correctedAssertion'
        : state==='verify-refute-review'?'refuteAllergy'
        : state.startsWith('verify')?'confirmAllergy'
        : patient?'reportAllergy':'createAllergy'
      : isSign?'signExact'
        : state==='create-review'?'createDraft'
        : state==='supersession-review'?'publishSuccessor'
        : state==='rollback-review'?'publishRollback':'publishRelease';
    const confirmationTone=state==='entered-in-error-review'?'danger'
      : ['correction-review','rollback-review'].includes(state)?'danger-outline':'primary';
    const mutation=allergy?(state.startsWith('verify')||state==='entered-in-error-review'?'verifyAllergy':'createAllergy'):isSign?'signClinicalContentRelease':state==='create-review'?'createClinicalContentRelease':'publishClinicalContentRelease';
    const details=allergy?`${pairs([['substance',t('syntheticSubstance')],['source',t(patient?'sourcePatient':'sourceClinician')],['version',iso(state==='verify-revision-review'?4:state==='entered-in-error-review'?3:state==='report-review'||state==='create-review'||state==='correction-review'?1:2)]])}<p>${t(state==='entered-in-error-review'||state==='correction-review'?'terminalHint':state.startsWith('verify')?'revisionsHint':'creationStatus')}</p>${state.startsWith('verify')?badge(state==='verify-refute-review'?'allergy-refuted':'allergy-confirmed','info'):''}${state.startsWith('verify')||state==='entered-in-error-review'?`<div class="fields">${field('reason',t('fixtureReason'),true)}${field('evidence',t('fixtureEvidence'))}</div>`:''}${state==='correction-review'?`<p>${t('correction')}: ${t('newAssertion')+' '+iso('→ A-TEST-001')}</p>`:''}`:`${pairs([['artifactVersion',iso(state==='rollback-review'?3:2)],['workflowVersion',iso(isSign||state==='create-review'?1:3)],['digest',iso(fixture.artifacts[state==='rollback-review'?3:2].digest)],['source',iso('TEST-NONCLINICAL-SOURCE-001')],['effectiveDate',iso(state==='rollback-review'?'2026-10-10T12:00:00+03:00':'2026-10-08T12:00:00+03:00')],['lineage',iso(state==='rollback-review'?'REL-TEST-003 → REL-TEST-002':'REL-TEST-002 → REL-TEST-001')]])}<p>${t(isSign?'physicianCapacity':'independence')}</p><p>${t(isSign?'currentGrant':state==='rollback-review'?'rollbackHint':'futureHint')}</p><p class="small">${iso('CODE-EVIDENCE-TEST-001 · TEST-VECTORS-NEUTRAL-001')}</p><p>${t('clinicalGate')}</p>`;
    dialog=`<div class="overlay"><section class="dialog ${allergy?'allergy-dialog':'content-dialog'}" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description"><header><h2 id="dialog-title">${stateTitle}</h2><p id="dialog-description" class="small">${t('controlsDemo')}</p></header><div class="dialog-body">${details}<p class="review-note">${t('candidate')}</p></div><footer>${button('cancel','cancel')}${button(confirmKey,mutation,false,confirmationTone,isSign?iso('REL-TEST-002 · v2'):'')}</footer></section></div>`;
  }
  const footer=`${t('notApproved')} · ${t('clinicalGate')}`;
  document.getElementById('composition').innerHTML=`<div class="${patient?'patient':'staff'} ${reviewer?'reviewer':''}" data-baseline="${escape(route.baselineId)}" data-state="${escape(state)}" data-projection="${statusOnly?'metadata-only':reviewer?'assigned-reviewer':'governed'}"><header class="topbar"><div class="brand">${locale==='ar-EG'?'شفاء':'SHIFAA'}<small class="muted">${t('candidate')}</small></div><div class="utility">${hidden?t('contextHidden'):patient?t(['guardian-read-only','delegate-read-only'].includes(state)?'readOnly':'self'):t('facility')}</div></header><div class="shell">${!patient&&!reviewer?`<nav aria-label="${t(title)}"><a href="#main">${t(title)}</a></nav>`:''}<main id="main" class="workspace"><div class="context"><div><strong>${context}</strong><p class="small">${hidden?t('freshnessUnknown'):t('purpose')+': '+t(allergy?'purposeCare':'purposeGovernance')}</p></div>${patient&&!hidden?button('choosePerson','context-switch'):''}</div><div class="heading"><h1>${t(title)}</h1><p class="small muted">${t(state==='stale'?'old':hidden?'freshnessUnknown':['superseded','rollback-review','published-effective'].includes(state)?'currentLater':'current')}</p></div><div class="banner ${tone}" role="status" aria-live="polite"><strong>${stateTitle}</strong><p class="small">${t('controlsDemo')}</p></div>${body}<div class="footer">${footer}</div><div class="evidence-tag">${iso(route.baselineId+' · '+state+' · '+locale)} · ${t('candidate')}</div></main></div>${patient?`<div class="patient-tabs"><a href="#main">${t('records')}</a></div>`:''}</div>${dialog}`;
  document.addEventListener('submit',event=>event.preventDefault());
  document.addEventListener('click',event=>{if(event.target.closest('button'))event.preventDefault();});
  await document.fonts.load(`400 16px ${locale==='ar-EG'?'PlexArabic':'Inter'}`);
  await document.fonts.load(`600 16px ${locale==='ar-EG'?'PlexArabic':'Inter'}`);
  await document.fonts.load(`700 16px ${locale==='ar-EG'?'PlexArabic':'Inter'}`);
  await document.fonts.ready;
  document.documentElement.dataset.ready='true';
}
render().catch(error=>{document.body.textContent=error.message;document.documentElement.dataset.error='true';});
