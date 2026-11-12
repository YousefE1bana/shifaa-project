/* Standalone design composition only. No API, storage, auth, clinical computation or domain mutations. */
'use strict';
const params = new URLSearchParams(location.search),
  ar = params.get('locale') !== 'en-EG',
  locale = ar ? 'ar-EG' : 'en-EG',
  family = params.get('family') || 'authoring',
  state = params.get('state') || 'ready';
const t = (a, e) => (ar ? a : e);
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const txt = {
  authoring: t('إنشاء الوصفة وفحص السلامة', 'Prescription authoring & safety'),
  physician: t('مراجعة الطبيب المستقل', 'Independent physician review'),
  pharmacy: t('مراجعة سلامة الوصفة', 'Prescription Safety Review'),
  emergency: t('متابعة المسار الاستثنائي التجريبي', 'Synthetic emergency pathway'),
  prescription: t('تفاصيل الوصفة', 'Prescription details'),
  medications: t('سجل الأدوية', 'Medication records'),
};
const patient = ['prescription', 'medications'].includes(family),
  reviewer = ['physician', 'pharmacy'].includes(family),
  discovery = [
    'discover',
    'claim_pending',
    'takeover_invalid',
    'released',
    'expired',
    'held_other',
    'empty',
    'loading',
    'denied',
    'revoked',
    'unavailable',
    'offline',
  ].includes(state),
  blocked = [
    'loading',
    'empty',
    'denied',
    'recoverable_error',
    'fatal_error',
    'offline',
    'stale',
    'conflict',
    'unavailable',
    'revoked',
    'uncertain',
    'expired',
    'rejected',
    'held_other',
    'withdrawn',
    'partial',
    'missing',
    'freshness_unknown',
  ].includes(state);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const tag = (text, kind = 'info') => `<span class="badge ${kind}">${esc(text)}</span>`;

// Presentation-only gating; no runtime authority or actions.
const recoveryGate =
  !patient && (blocked || ['producer_failure', 'claim_pending', 'window_expired'].includes(state));
const button = (label, kind = 'secondary', purpose = 'domain') => {
  const locked = recoveryGate && purpose === 'domain';
  if (recoveryGate && purpose === 'recovery') kind = 'secondary';
  return (
    '<button type="button" class="' +
    kind +
    '" data-purpose="' +
    purpose +
    '" aria-disabled="true"' +
    (locked ? ' disabled aria-describedby="action-gate"' : '') +
    '>' +
    (locked ? t('محظور: ', 'Blocked: ') : '') +
    esc(label) +
    '</button>'
  );
};
function actionGate() {
  if (!recoveryGate) return '';
  const uncertain = ['uncertain', 'claim_pending', 'recoverable_error'].includes(state);
  const terminal = ['expired', 'rejected'].includes(state);
  return (
    '<section class="alert action-gate" id="action-gate" role="status"><h2>' +
    t('إجراءات الحالة محظورة الآن', 'Case actions are blocked now') +
    '</h2><p>' +
    (uncertain
      ? t(
          'أعد قراءة الحالة المصرح بها وصالح النتيجة بالمفتاح الأصلي. لا تفترض فشل الالتزام ولا ترسل قراراً أو توقيعاً أو تولياً جديداً.',
          'Reread authorized state and reconcile with the original key. Do not assume rollback or submit a new decision, signature or claim.',
        )
      : state === 'window_expired'
        ? t(
            'انتهت النافذة دون تمديد أو إعادة ضبط. قد تبقى مراجعة الطلب الحي مطلوبة؛ لا توقيع تلقائي ولا إعادة فتح طلب نهائي.',
            'The window expired without extension or reset. A live request may still require review; no implicit signing or terminal reopening.',
          )
        : terminal
          ? t(
              'هذه الحالة منتهية؛ التحديث لا يعيد فتحها ولا يمدد النافذة. اعرض الحالة الحالية ومسار الاستعادة المصرح به.',
              'This state is terminal; refresh cannot reopen it or extend the window. Read current state and the authorized recovery path.',
            )
          : t(
              'حدّث الحالة والأهلية الحالية وأعد التحقق من الدليل المطلوب قبل أي محاولة أخرى. المسودة السابقة باقية؛ لا نجاح جزئي ولا نتيجة فحص مختلقة.',
              'Refresh current state and eligibility and revalidate required evidence before another attempt. The prior draft remains intact; no partial success or fabricated check.',
            )) +
    '</p><p>' +
    t(
      'لن يُتاح الإجراء إلا بعد إثبات شروطه الحالية؛ التحديث وحده لا يمنح التصريح.',
      'Actions become available only after current prerequisites are proven; refresh alone grants no authority.',
    ) +
    '</p><div class="actions">' +
    button(
      uncertain
        ? t('قراءة الحالة ومصالحة النتيجة أولاً', 'Read state and reconcile first')
        : t('قراءة الحالة الحالية أولاً', 'Read current state first'),
      'secondary',
      'recovery',
    ) +
    '</div><p class="meta">' +
    t(
      'مرجع تصميم فقط؛ لا ينفذ الزر طلباً أو يعيد تمكين إجراء.',
      'Design reference only; this control sends no request and enables no action.',
    ) +
    '</p></section>'
  );
}
const facts = (rows) =>
  `<dl class="facts">${rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>`;
const card = (heading, body) => `<section class="card"><h2>${heading}</h2>${body}</section>`;
const field = (id, label, value, area = false) =>
  `<div class="field"><label for="${id}">${label}</label>${area ? `<textarea id="${id}" readonly>${esc(value)}</textarea>` : `<input id="${id}" readonly value="${esc(value)}">`}</div>`;
const copy = {
  loading: [
    t('جارٍ تحميل الحالة الحالية', 'Loading current state'),
    t(
      'لا يمكن تأكيد المصدر أو إتاحة إجراء قبل اكتمال القراءة المصرّح بها.',
      'Source state and available actions remain unconfirmed until the authorized read completes.',
    ),
    t('انتظر ثم أعد المحاولة إذا استمر التحميل.', 'Wait, then retry if loading persists.'),
    'info',
  ],
  empty: [
    t('لا توجد سجلات في النطاق المسموح', 'No records in the authorized scope'),
    t(
      'هذه نتيجة فارغة ضمن النطاق المعروض فقط؛ لا تعني عدم وجود حساسية أو أدوية.',
      'This is empty only within the displayed authorized scope; it does not establish absence of allergies or medication.',
    ),
    t('راجع النطاق أو حدّث القراءة الحالية.', 'Check the scope or refresh the current read.'),
    'info',
  ],
  denied: [
    t('لا يتوفر تصريح حالي للعرض أو الإجراء', 'Current access is not authorized'),
    t(
      'لا تُعرض تفاصيل السجل أو وجود مصادر محجوبة.',
      'Record details and hidden-source existence are not disclosed.',
    ),
    t('ارجع إلى سياق مصرح به.', 'Return to an authorized context.'),
    'danger',
  ],
  recoverable_error: [
    t('تعذّر إكمال الطلب', 'The request could not complete'),
    t(
      'النسخة المحفوظة سابقاً باقية. لا يُفترض نجاح التغيير.',
      'The previously committed version remains. A successful change is not assumed.',
    ),
    t(
      'أعد القراءة ثم أعد المحاولة بنفس مفتاح الطلب عند المصالحة.',
      'Refresh, then reconcile using the original request key.',
    ),
    'warning',
  ],
  fatal_error: [
    t('تعذّر التحقق من سلامة الحالة', 'State integrity could not be established'),
    t(
      'الإجراءات متوقفة؛ لا يمكن الاعتماد على حالة غير مثبتة.',
      'Actions are blocked; unproven state cannot be relied on.',
    ),
    t('ارجع واتصل بمسؤول بيئة التدريب.', 'Return and contact the training-environment operator.'),
    'danger',
  ],
  offline: [
    t('الاتصال غير متاح', 'Connection unavailable'),
    t(
      'لا تُحفظ إجراءات الوصفات للمزامنة لاحقاً.',
      'Prescription mutations are not queued for later synchronization.',
    ),
    t('أعد الاتصال ثم حدّث الحالة المصرّح بها.', 'Reconnect, then refresh authorized state.'),
    'warning',
  ],
  stale: [
    t('قد تكون المعلومات قديمة', 'Information may be outdated'),
    t(
      'المصدر المعروض لا يثبت الصلاحية الحالية.',
      'The displayed source does not establish current eligibility.',
    ),
    t(
      'حدّث المصدر وأعد الفحص قبل أي إجراء يعتمد عليه.',
      'Refresh evidence and rerun checks before relying on it.',
    ),
    'warning',
  ],
  conflict: [
    t('تغيّرت النسخة أثناء العمل', 'The version changed during this action'),
    t(
      'تحديث النسخة لا يعيد ربط الأدلة أو الموافقات تلقائياً.',
      'Refreshing a version does not silently rebind evidence or approvals.',
    ),
    t(
      'حدّث الحالة وراجع التغييرات؛ لا تكرر إجراءً غير مؤكد بمفتاح جديد.',
      'Refresh and review changes; do not retry an uncertain action with a new key.',
    ),
    'warning',
  ],
  success: [
    t('نتيجة محفوظة في سجل التجربة', 'Durable exercise outcome'),
    t(
      'الحالة والمرجع والوقت والخطوة التالية ظاهرة؛ لا يكفي إشعار عابر.',
      'Status, reference, time and next step are shown; a transient toast is insufficient.',
    ),
    t(
      'راجع الإيصال ثم اتبع الخطوة المصرّح بها التالية.',
      'Read the receipt, then follow the next authorized action.',
    ),
    'info',
  ],
  unavailable: [
    t('المصدر غير متاح الآن', 'Source temporarily unavailable'),
    t(
      'عدم الإتاحة ليس نتيجة فارغة ولا فحصاً ناجحاً.',
      'Unavailability is neither an empty result nor a successful check.',
    ),
    t(
      'أعد القراءة عند عودة المصدر؛ تبقى النسخة المحفوظة سليمة.',
      'Retry when the source returns; committed drafts remain intact.',
    ),
    'warning',
  ],
  revoked: [
    t('انتهت الصلاحية الحالية', 'Current authority is no longer valid'),
    t(
      'التكليف أو الجلسة السابقة لا يمنحان استمرار الوصول.',
      'A previous assignment or session does not continue to authorize access.',
    ),
    t('ارجع إلى سياق حالي مصرح به.', 'Return to a currently authorized context.'),
    'danger',
  ],
  uncertain: [
    t('نتيجة الطلب غير مؤكدة', 'Request outcome is uncertain'),
    t(
      'فقدان الرد لا يثبت التراجع عن الحفظ.',
      'A lost response does not prove the transaction rolled back.',
    ),
    t(
      'صالح الطلب بمفتاحه الأصلي مع إعادة التحقق من الصلاحية.',
      'Reconcile the original key with current authorization.',
    ),
    'warning',
  ],
  expired: [
    t('انتهت مدة الطلب', 'Request expired'),
    t(
      'لا مراجعة متأخرة ولا إعادة فتح ولا تمديد تلقائي.',
      'No late approval, reopening or automatic extension.',
    ),
    t(
      'ابدأ طلباً مرتبطاً جديداً بعد التصحيح والفحص المصرح بهما.',
      'Create a fresh linked request after authorized correction and checking.',
    ),
    'warning',
  ],
  partial: [
    t('المصدر غير مكتمل', 'Partial source coverage'),
    t(
      'المعلومات المتاحة لا تغطي كل النطاق المطلوب.',
      'Available information does not cover the full required scope.',
    ),
    t(
      'راجع التغطية وأعد القراءة؛ لا تعلن اكتمال الفحص.',
      'Review coverage and reread; do not claim a complete check.',
    ),
    'warning',
  ],
  missing: [
    t('المصدر المطلوب غير مثبت', 'Required source is missing'),
    t('لا تُستنتج معلومات من مصدر غير موجود.', 'No facts are inferred from a missing source.'),
    t(
      'اعرض القيد واطلب المصدر عبر المسار المصرح به.',
      'Show the limitation and obtain the source through an authorized path.',
    ),
    'warning',
  ],
  freshness_unknown: [
    t('حداثة المصدر غير معروفة', 'Source freshness is unknown'),
    t(
      'وقت العرض لا يثبت وقت تحديث المصدر.',
      'The display time does not establish when the producer updated its data.',
    ),
    t(
      'راجع المصدر؛ لا تفترض مدة صلاحية.',
      'Review the source; do not assume a freshness interval.',
    ),
    'warning',
  ],
  withdrawn: [
    t('الوصول إلى العرض غير متاح', 'Projection access is unavailable'),
    t(
      'لا يمكن متابعة عرض سجل دون صلاحية حالية.',
      'A record cannot remain visible without current authorization.',
    ),
    t('ارجع إلى السجلات المصرّح بها.', 'Return to authorized records.'),
    'danger',
  ],
  held_other: [
    t('الحالة قيد مراجعة مراجع آخر', 'Another reviewer holds the case'),
    t(
      'التكليف الساري محمي؛ لا يمكن الاستيلاء عليه.',
      'A valid assignment is protected; it cannot be taken over.',
    ),
    t('حدّث القائمة أو اختر حالة متاحة.', 'Refresh the list or select an eligible case.'),
    'info',
  ],
  rejected: [
    t('رُفض الطلب في مسار المراجعة', 'The review lane rejected the request'),
    t(
      'الرفض محفوظ ولا يُستبدل بحالة تسليم إشعار.',
      'The rejection remains immutable and is not replaced by a delivery status.',
    ),
    t(
      'صحّح المسودة وأعد الفحص ثم أنشئ طلباً جديداً عند السماح.',
      'Correct the draft, recheck, and create a new request when permitted.',
    ),
    'danger',
  ],
  released: [
    t('أُنهي التكليف الخاص بك', 'Your assignment was released'),
    t(
      'انتهى الاعتماد على هذا التكليف. السجل التاريخي محفوظ.',
      'Reliance on this assignment ended. History is preserved.',
    ),
    t('ارجع إلى قائمة الحالات المتاحة.', 'Return to eligible case discovery.'),
    'info',
  ],
  window_expired: [
    t('انتهت النافذة الافتراضية', 'Virtual window expired'),
    t(
      'لا تمديد ولا إعادة ضبط. لا توقيع مع بقاء مراجعة الصيدلي معلّقة.',
      'No extension or reset. No signing while pharmacist review remains pending.',
    ),
    t(
      'انتظر مراجعة حالية للطلب الحي؛ لا تُعد فتح طلب نهائي.',
      'Wait for current review of a live request; never reopen a terminal request.',
    ),
    'warning',
  ],
  delivery_failure: [
    t('تعذّر تسليم الإشعار؛ واجب المراجعة باقٍ', 'Notification failed; review obligation remains'),
    t(
      'فشل النقل لا يلغي الطلب ولا يثبت المراجعة.',
      'Transport failure neither removes the request nor establishes review.',
    ),
    t(
      'استخدم قائمة المراجعة الدائمة وتابع الاسترداد المصرح به.',
      'Use durable case discovery and authorized delivery recovery.',
    ),
    'warning',
  ],
  blocked_obligation: [
    t('واجب المراجعة ما زال معلّقاً', 'Review obligation remains pending'),
    t(
      'التوقيع التاريخي لا يُمحى؛ لا استمرار ضمني للمسار.',
      'Historical signing is not erased; continuation is not implied.',
    ),
    t(
      'أكمل المراجعة الحالية ضمن الطلب الحي فقط.',
      'Complete current review only while the request remains live.',
    ),
    'warning',
  ],
  producer_failure: [
    t('لم ينتج فحص السلامة نتيجة مطلوبة', 'Safety producer did not produce the required outcome'),
    t(
      'لا حفظ جزئي ناجح ولا فحص ناجح وهمي؛ المسودة السابقة باقية.',
      'No partial successful save or fabricated check result; the previous draft remains intact.',
    ),
    t(
      'استعد المصدر ثم أعد العملية المصرح بها.',
      'Recover the source, then retry the authorized operation.',
    ),
    'danger',
  ],
  step_up: [
    t('يلزم تحقق حديث بعامل إضافي', 'Fresh factor authentication required'),
    t(
      'صلاحية العامل منفصلة عن وقت إصدار الرمز.',
      'Factor freshness is distinct from token issuance time.',
    ),
    t('أكمل التحقق ثم أعد قراءة الحالة الحالية.', 'Complete step-up, then refresh current state.'),
    'warning',
  ],
};
const sourceLabel =
  state === 'stale'
    ? t('قديمة', 'Stale')
    : state === 'partial'
      ? t('جزئية', 'Partial')
      : state === 'missing'
        ? t('مفقودة', 'Missing')
        : state === 'unavailable'
          ? t('غير متاحة', 'Unavailable')
          : state === 'freshness_unknown'
            ? t('الحداثة غير معروفة', 'Freshness unknown')
            : state === 'verified_empty'
              ? t('فارغة ضمن النطاق المثبت', 'Verified empty within scope')
              : t('معلومة ضمن النطاق المعلن', 'Known within declared scope');
if (patient) {
  if (state === 'expired')
    copy.expired = [
      t('انتهت صلاحية الوصفة', 'Prescription expired'),
      t(
        'يعرض السجل التاريخي المصرح به دون تجديد أو استنتاج استعمال دواء.',
        'The authorized historical record remains distinct from renewal or current medication use.',
      ),
      t('حدّث حالة المصدر أو ارجع إلى السجلات.', 'Refresh source state or return to records.'),
      'warning',
    ];
  if (['recoverable_error', 'uncertain', 'conflict'].includes(state))
    copy[state] = [
      t('تعذّر تأكيد القراءة الحالية', 'Current read could not be confirmed'),
      t(
        'لا تُفترض إتاحة سجل أو اكتمال المصدر من رد مفقود أو قديم.',
        'A lost or outdated response establishes neither record visibility nor complete coverage.',
      ),
      t(
        'حدّث القراءة المصرح بها؛ لا تنفذ الصفحة أي تغيير على السجلات.',
        'Refresh the authorized read; this page does not mutate records.',
      ),
      'warning',
    ];
}
copy.verified_empty = [
  t('نتيجة فارغة ضمن نطاق مثبت', 'Verified empty within a declared scope'),
  t(
    'لا توجد سجلات ضمن مجموعة العرض المصرح بها المكتملة فقط؛ هذا لا يعني عدم وجود أدوية أو حساسية.',
    'No records exist within this complete authorized projection scope only; this does not establish absence of medications or allergies.',
  ),
  t('راجع النطاق أو حدّث القراءة الحالية.', 'Review the scope or refresh the authorized read.'),
  'info',
];
function alert() {
  const c = copy[state];
  return c
    ? `<section class="alert ${c[3]}" role="${['danger', 'warning'].includes(c[3]) ? 'alert' : 'status'}"><h2>${c[0]}</h2><p>${c[1]}</p><p><strong>${t('الخطوة التالية:', 'Next step:')}</strong> ${c[2]}</p></section>`
    : '';
}
function evidence() {
  return card(
    t('المصدر وحدود الفحص', 'Source & assessment limits'),
    facts([
      [
        t('المصدر', 'Source'),
        t('مدخل آلية تجريبي مصرح به', 'Authorized synthetic mechanism input'),
      ],
      [t('التغطية', 'Coverage'), sourceLabel],
      [
        t('الحساسية والأدوية', 'Allergy & medication evidence'),
        t(
          'التغطية مرتبطة بالمصدر؛ لا استنتاج سريري',
          'Source-bound coverage; no clinical inference',
        ),
      ],
      [
        t('الحكم السريري', 'Clinical assessment'),
        t('لم يُستكمل التقييم السريري', 'Clinical assessment not fully checked'),
      ],
    ]) +
      `<p class="meta"><bdi dir="ltr">not_fully_checked</bdi> · ${t('مطابقة المصدر لا تسمح بالعلاج أو التوقيع السريري.', 'Source matching does not authorize treatment or clinical signing.')}</p>`,
  );
}
function receipt() {
  return `<section class="result" aria-label="${t('إيصال نتيجة تجريبية', 'Exercise outcome receipt')}">${facts(
    [
      [t('الحالة', 'Status'), t('نتيجة تجريبية محفوظة', 'Committed exercise outcome')],
      [t('المرجع', 'Reference'), '<bdi dir="ltr">DESIGN-RECEIPT</bdi>'],
      [t('وقت المثال', 'Example time'), '<bdi dir="ltr">2026-11-11 12:00 UTC</bdi>'],
      [t('التالي', 'Next'), t('عرض الحالة الحالية المصرّح بها', 'Read current authorized state')],
    ],
  )}</section>`;
}
function authoring() {
  const context = ['warning_m', 'warning_na', 'normal_request', 'emergency_request'].includes(state)
    ? state
    : null;
  const heading =
    context === 'warning_m' || context === 'warning_na'
      ? t('تنبيه ضمن تمرين آلية', 'Mechanism warning exercise')
      : t('توقف آلية تجريبي', 'Synthetic mechanism stop');
  const form = context
    ? `<section class="alert ${context.includes('request') ? 'danger' : ''}"><h2>${heading}</h2><p>${t('حقائق التمرين: مدخل بنيوي مصرح به؛ التصنيف هنا سياق تصميم فقط.', 'Exercise facts: approved structural input; this designation is a design context only.')}</p><p>${t('النتيجة: يلزم استيفاء المسار المحدد قبل التوقيع التجريبي المنفصل.', 'Consequence: complete the designated pathway before separate simulated signing.')}</p><p class="meta">${t('المصدر: مدخل هندسي ثابت؛ لا قاعدة طبية تنفيذية.', 'Source: immutable engineering input; no executable clinical rule.')}</p>${field('reason', t('سبب منظم', 'Structured reason'), t('يُختار من أسباب التمرين المعتمدة', 'Select from approved exercise reasons'))}${field('justification', t('التبرير الخاص بالحالة', 'Case-specific justification'), t('مطلوب قبل إرسال الطلب؛ لا نص طبي مُختلق', 'Required before request submission; no invented medical text'), true)}${context.includes('request') ? field('alternatives', t('البدائل التي نوقشت', 'Alternatives considered'), t('إدخال مصرح به مطلوب', 'Authorized input required'), true) : ''}${context !== 'warning_na' ? field('monitor', t('خطة المتابعة', 'Monitoring plan'), t('حقل هندسي مطلوب؛ التعليمات الطبية غير مقدمة', 'Required engineering field; medical instructions not supplied'), true) : `<p>${t('المتابعة غير منطبقة فقط في سياق التمرين المعتمد المقابل.', 'Monitoring is not applicable only in the corresponding approved exercise context.')}</p>`}${context.includes('request') ? field('expiry', t('انتهاء الطلب', 'Request expiry'), t('بحد أقصى ثلاثين دقيقة وأي حد أسبق', 'At most thirty minutes and any earlier bound')) : ''}<div class="actions">${button(context?.includes('request') ? t('إرسال طلب مراجعة تجريبي', 'Request synthetic review') : t('تسجيل الإقرار التجريبي', 'Record synthetic acknowledgement'), 'primary')}</div></section>`
    : '';
  return `<div class="grid"><div class="stack">${card(
    t('المسودة الحالية', 'Current draft'),
    `<p>${t('عنصر آلية تجريبي ثابت؛ لا اقتراح لدواء أو جرعة.', 'Immutable synthetic mechanism item; no medicine or dose suggestion.')}</p>${facts(
      [
        [t('النسخة', 'Version'), '<bdi dir="ltr">1</bdi>'],
        [t('الحالة', 'State'), t('غير موقعة', 'Unsigned')],
      ],
    )}<div class="actions">${button(t('فحص السلامة', 'Run safety check'), 'primary')}${button(t('تصحيح المسودة', 'Correct draft'))}</div>`,
  )}${form}${card(t('التوقيع إجراء منفصل', 'Signing is a separate action'), `<p>${t('لا توقيع من الإقرار أو الإشعار أو انتهاء الوقت. الدليل غير المكتمل يمنع التوقيع التجريبي.', 'Acknowledgement, delivery or elapsed time never signs. Incomplete required evidence prevents simulated signing.')}</p>${field('release', t('عرض السجلات للشخص المعني — مقترح للمراجعة', 'Subject record release — review proposal'), t('الوصفة وسجلات الوصف، كلٌ على حدة؛ لا اختيار افتراضي', 'Prescription and prescribed records independently; no default selection'))}<p class="meta">${t('السياسة الجديدة لم تعتمد بعد؛ هذا عرض تصميم مشروط فقط.', 'The new policy is not approved; this is a conditional design preview only.')}</p><div class="actions">${button(t('تأكيد توقيع تجريبي منفصل', 'Confirm separate simulated sign'), 'primary')}${button(t('إلغاء الوصفة الموقعة عند التصريح', 'Cancel signed prescription when authorized'), 'danger')}</div>${state === 'success' ? receipt() : ''}`)}</div><div class="stack">${evidence()}${card(t('المراجعة المستقلة', 'Independent review'), `<p>${t('الصيدلي والطبيب الثاني أشخاص مختلفون عن الواصف وعن بعضهما.', 'Pharmacist and second physician are distinct people from the prescriber and each other.')}</p><p>${t('التوقيع لا يستنتج صرفاً أو بدء استعمال دواء.', 'Signing implies neither dispensing nor current medication use.')}</p>`)}</div></div>`;
}
function review() {
  if (discovery)
    return card(
      t('اكتشاف الحالات المتاحة', 'Discover eligible cases'),
      `<p>${t('قبل التكليف: بيانات الحالة والمسار والمنشأة والوقت فقط. لا تفاصيل شخص أو دواء.', 'Before assignment: case/lane/facility/time metadata only. No patient or medicine details.')}</p>${
        state === 'empty' || state === 'loading'
          ? ''
          : `<div class="row"><h3>${t('حالة مراجعة تجريبية', 'Synthetic review case')}</h3>${facts([
              [
                t('المنشأة الأصلية', 'Originating facility'),
                t('منشأة تدريبية', 'Training facility'),
              ],
              [
                t('المسار', 'Lane'),
                family === 'physician'
                  ? t('طبيب ثانٍ', 'Second physician')
                  : t('صيدلي', 'Pharmacist'),
              ],
              [
                t('حالة التكليف', 'Assignment'),
                state === 'held_other'
                  ? t('لدى مراجع آخر', 'Held by another')
                  : state === 'expired'
                    ? t('طلب نهائي؛ لا تولّي', 'Terminal request; no claim')
                    : state === 'claim_pending'
                      ? t('انتظار نتيجة التولّي', 'Claim outcome pending')
                      : t('أعد قراءة الأهلية الحالية', 'Reread current eligibility'),
              ],
              [
                t('مدة التكليف', 'Assignment bound'),
                t(
                  'حتى خمس دقائق وأي انتهاء أسبق؛ لا تجديد',
                  'At most five minutes and earlier expiry; no renewal',
                ),
              ],
            ])}<div class="actions">${['discover', 'takeover_invalid'].includes(state) ? button(state === 'takeover_invalid' ? t('تولّي تكليف ثبت بطلانه', 'Take over proven-invalid assignment') : t('تولّي الحالة بنفسي', 'Claim for myself'), 'primary') : button(t('تحديث الحالات المصرح بها', 'Refresh authorized cases'), 'secondary', 'recovery')}</div></div>`
      }<p class="meta">${t('التولّي البديل مسموح فقط بعد إثبات بطلان التكليف الحالي.', 'Takeover is permitted only after current-holder invalidity is proven.')}</p>`,
    );
  return `<div class="grid"><div class="stack">${card(
    t('تفاصيل الحالة المكلّف بها', 'Assigned case detail'),
    `<p>${t('تفاصيل لازمة فقط للعناصر المرتبطة بالمشكلة التي سمح بعرضها.', 'Only necessary issue-implicated captured details are displayed.')}</p>${facts(
      [
        [t('التكليف', 'Assignment'), t('خاص بالمراجع الحالي', 'Held by current reviewer')],
        [
          t('استقلال الشخص', 'Person independence'),
          t(
            'مطلوب حالياً؛ حساب آخر لا يكفي',
            'Required currently; another account is insufficient',
          ),
        ],
        [t('الأدلة', 'Evidence'), sourceLabel],
        [
          t('الوقت المتبقي', 'Time bound'),
          t('حد حالي؛ لا تجديد تلقائي', 'Current bound; no automatic renewal'),
        ],
      ],
    )}${field('rationale', t('مبرر الطلب المسموح', 'Permitted request rationale'), t('محتوى تجريبي مصرح به فقط؛ لا سجل شخص آخر', 'Only authorized synthetic content; no other patient history'), true)}${field('review-comment', t('تعليق القرار', 'Decision comment'), t('إدخال المراجع الحالي مطلوب', 'Current reviewer input required'), true)}<div class="actions">${button(t('اعتماد المراجعة التجريبية', 'Approve synthetic review'), 'primary')}${button(t('رفض الطلب', 'Reject request'), 'danger')}${button(t('ترك تكليفي', 'Release my assignment'))}</div><p class="meta">${t('الأزرار مرجعية للتصميم فقط ولا تنفذ أي إجراء.', 'Controls are design references only and execute no action.')}</p>${state === 'success' ? receipt() : ''}`,
  )}</div><div class="stack">${evidence()}${card(t('الخطوة المستقلة التالية', 'Separate next action'), `<p>${t('قرار المراجعة ليس توقيعاً. العودة للواصف لاتخاذ التوقيع المنفصل عند استيفاء الشروط.', 'Review approval is not signing. The prescriber performs separate signing only when all guards hold.')}</p>`)}</div></div>`;
}
function emergency() {
  return `<div class="grid"><div class="stack">${card(t('المسارات والنافذة الافتراضية', 'Lanes & virtual window'), `<p>${t('نافذة آلية افتراضية مدتها ستون ثانية؛ ليست مهلة طبية أو سياسة منشأة.', 'A virtual sixty-second mechanism window; neither a clinical deadline nor facility policy.')}</p><div class="step"><strong>${t('الطبيب الثاني', 'Second physician')}</strong>${tag(t('مراجعة مستقلة مطلوبة', 'Independent review required'))}</div><div class="step"><strong>${t('الصيدلي', 'Pharmacist')}</strong>${tag(t('واجب دائم قيد المراجعة', 'Durable review obligation pending'), 'warning')}</div><div class="step"><strong>${t('النافذة', 'Window')}</strong>${tag(state === 'window_expired' ? t('منتهية — لا إعادة ضبط', 'Expired — no reset') : t('توقيت افتراضي ثابت للمراجعة', 'Fixed virtual review timing'), 'warning')}</div><p>${t('تبدأ النافذة مرة واحدة فقط بعد قبول مراجعة الطبيب الثاني. تسليم الإشعار لا يساوي المراجعة.', 'Window starts once after second-physician approval. Delivery does not equal review.')}</p><div class="actions">${button(t('عرض الحالة الحالية', 'Read current state'), 'primary', 'recovery')}${button(t('توقيع تجريبي منفصل عند استيفاء الشروط', 'Separate simulated sign when eligible'))}</div>${state === 'success' ? receipt() : ''}`)}</div><div class="stack">${card(
    t('الطلب والتكليف', 'Request & assignment'),
    facts([
      [
        t('الطلب', 'Request'),
        state === 'expired'
          ? t('منتهٍ ونهائي', 'Expired and terminal')
          : t('حي ما دامت شروطه الحالية سارية', 'Live only while current guards hold'),
      ],
      [
        t('التكليف', 'Assignment'),
        t('حتى خمس دقائق، لا تمديد', 'At most five minutes, no extension'),
      ],
      [
        t('الاسترداد', 'Recovery'),
        t('طلب مرتبط جديد بدلاً من إعادة الفتح', 'Fresh linked request instead of reopening'),
      ],
    ]),
  )}${evidence()}</div></div>`;
}
function prescription() {
  const historical = ['cancelled', 'superseded', 'expired'].includes(state);
  const historyNotice = historical
    ? '<section class="alert danger historical" role="status"><h2>' +
      t('سجل تاريخي — غير صالح للاستخدام الحالي', 'Historical record — not valid for current use') +
      '</h2><p>' +
      (state === 'cancelled'
        ? t('الوصفة ملغاة.', 'This prescription is cancelled.')
        : state === 'superseded'
          ? t('الوصفة مستبدلة.', 'This prescription is superseded.')
          : t('الوصفة منتهية.', 'This prescription is expired.')) +
      ' ' +
      t(
        'تُعرض لحفظ التاريخ فقط؛ لا تستخدمها كوصفة حالية ولا كتعليمات علاج. لا يمنح رابط الاستبدال تصريحاً لعرض وصفة أخرى.',
        'Shown to preserve history only; do not use it as a current prescription or treatment instruction. A replacement link grants no access to another prescription.',
      ) +
      '</p></section>'
    : '';

  const status =
    state === 'cancelled'
      ? t('ملغاة', 'Cancelled')
      : state === 'superseded'
        ? t('استُبدلت', 'Superseded')
        : state === 'expired'
          ? t('منتهية', 'Expired')
          : t('موقعة', 'Signed');
  return `${historyNotice}<div class="stack">${card(
    t('سجل وصفة مصرح بعرضه — مثال مشروط', 'Authorized prescription record — conditional example'),
    `<div class="topline">${tag(status)}<span class="meta">${t('معرّف عرض غير دال', 'Opaque display reference')}</span></div><p>${t('عنصر تجريبي؛ تفاصيل الدواء والجرعة لا تُملأ عند غيابها من المصدر.', 'Synthetic item; medicine and dose details are not filled in when absent from the source.')}</p>${facts(
      [
        [t('المصدر', 'Source'), t('سجل وصفة أصلي', 'Original prescription record')],
        [t('حداثة المصدر', 'Source freshness'), sourceLabel],
        [
          t('النطاق', 'Scope'),
          t('النسخة المصرح بعرضها لهذا الشخص فقط', 'Released revision for this subject only'),
        ],
        [
          t('تقييم سريري', 'Clinical assessment'),
          t('لم يكتمل التحقق السريري', 'Clinical assessment not fully checked'),
        ],
      ],
    )}<p>${t('ظهور الوصفة لا يؤكد صرف الدواء أو استعماله حالياً.', 'A visible prescription does not confirm dispensing or current use.')}</p><div class="actions">${button(t('تحديث حالة المصدر', 'Refresh source state'), 'primary', 'recovery')}${button(t('العودة إلى السجلات', 'Back to records'), 'secondary', 'navigation')}</div>`,
  )}</div>`;
}
function medications() {
  return `<div class="stack">${card(t('سجلات وصف الأدوية', 'Prescribed medication records'), `<p>${t('سجلات صادرة من وصفة موقعة ومصرح بعرضها؛ لا تؤكد الصرف أو الاستعمال الحالي.', 'Records from signed prescriptions with explicit release; they do not confirm dispensing or current use.')}</p>${state === 'verified_empty' ? `<p>${t('لا سجلات في مجموعة العرض المصرّح بها والمثبتة؛ هذا لا يعني عدم استعمال أدوية.', 'No records in the complete authorized projection; this does not mean no medication use.')}</p>` : `<div class="row"><h3>${t('عنصر تجريبي مصرح بعرضه', 'Released synthetic item')}</h3>${tag(t('موصوف', 'Prescribed'))}<p>${t('المصدر: سجل وصف أصلي. الحداثة:', 'Source: original prescribed record. Freshness:')} ${sourceLabel}</p><p>${t('تفاصيل غير متاحة تبقى غير معروفة؛ لا تُنشأ جرعة أو مدة افتراضية.', 'Unavailable facts remain unknown; no default dose or duration is created.')}</p></div>`}<div class="actions">${button(t('تحديث السجلات المصرح بها', 'Refresh authorized records'), 'primary', 'recovery')}</div>`)}${card(
    t('حدود سجل الدواء', 'Medication history limits'),
    `<p>${t('بيانات صرف الدواء غير متاحة في هذا المصدر.', 'Dispensing records are not available from this source.')}</p>${facts(
      [
        [t('الصرف', 'Dispensing'), t('مصدر مفقود — لا استنتاج', 'Missing source — no inference')],
        [t('الاستعمال الحالي', 'Current use'), t('غير معروف', 'Unknown')],
        [
          t('حالة الوصفة', 'Prescription status'),
          t('تُعرض فقط بتصريح مستقل للمصدر', 'Shown only with independent source authorization'),
        ],
      ],
    )}`,
  )}</div>`;
}
const noDetails =
  ['denied', 'revoked', 'withdrawn', 'fatal_error', 'step_up', 'loading', 'empty'].includes(
    state,
  ) ||
  (patient && ['missing', 'unavailable', 'verified_empty'].includes(state));
let body = noDetails
  ? card(
      t('حالة العرض', 'View state'),
      state === 'loading'
        ? `<div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div><p>${t('جارٍ التحميل…', 'Loading…')}</p>`
        : `<p class="no-data">${t('لا تُعرض بيانات السجل في هذه الحالة.', 'Record data is not displayed in this state.')}</p><div class="actions">${button(t('العودة إلى سياق مصرح به', 'Return to authorized context'), 'primary', 'navigation')}</div>`,
    )
  : family === 'authoring'
    ? authoring()
    : reviewer
      ? review()
      : family === 'emergency'
        ? emergency()
        : family === 'prescription'
          ? prescription()
          : medications();
if (reviewer && state === 'discover') body = review();
document.body.className = patient ? 'patient' : 'staff';
document.getElementById('root').innerHTML =
  `<a class="skip" href="#main">${t('انتقل إلى المحتوى', 'Skip to content')}</a><div class="preview"><strong>${t('تصميم مرشح غير معتمد', 'Unapproved design candidate')}</strong> · ${t('بيانات تجريبية فقط · لا اتصال بخدمة ولا تنفيذ إجراءات', 'Synthetic only · no service connection or actions executed')} · <bdi dir="ltr">${esc(family)} / ${esc(state)}</bdi></div><div class="shell"><aside aria-label="${t('تنقل التطبيق', 'Application navigation')}"><div class="brand">${t('شفاء', 'SHIFAA')}</div><p>${family === 'pharmacy' ? t('الصيدلية', 'Pharmacy') : t('العيادة', 'Clinic')}</p><p class="selected">${txt[family] || txt.authoring}</p><p>${t('بيئة تدريبية مقيدة', 'Restricted training environment')}</p></aside><div><header class="utility"><strong>${t('شفاء', 'SHIFAA')}</strong><span>${patient ? t('الشخص المعني فقط', 'Subject only') : t('منشأة تدريبية', 'Training facility')}</span><span>${patient ? t('حساب الشخص الحالي', 'Current subject account') : family === 'pharmacy' ? t('تكليف صيدلي تجريبي', 'Synthetic pharmacist designation') : family === 'physician' ? t('تكليف طبيب مستقل تجريبي', 'Synthetic independent physician designation') : t('واصف تجريبي', 'Synthetic prescriber')}</span>${!patient ? tag(t('تحقق حالي بعاملين مطلوب', 'Current AAL2 required')) : ''}</header><main class="content" id="main" tabindex="-1"${patient ? ` aria-label="${t('محتوى السجل القابل للتمرير', 'Scrollable record content')}"` : ''}><div class="eyebrow">${t('بيئة تجريبية — ليست خدمة رعاية حقيقية', 'Engineering environment — not real care')}</div><h1>${txt[family] || txt.authoring}</h1>${!reviewer || !discovery ? `<section class="context" aria-label="${t('سياق العرض', 'Viewing context')}"><div class="grow"><strong>${t('شخص تجريبي', 'Synthetic subject')}</strong><p class="meta">${patient ? t('العلاقة: الشخص نفسه · التصريح بالعرض مستقل عن التوقيع', 'Relationship: self · release is independent of signing') : t('سياق حالة مصرح به؛ لا بيانات حقيقية', 'Authorized synthetic case context; no real data')}</p></div>${patient ? button(t('تبديل الشخص', 'Switch person'), 'secondary', 'navigation') : tag(t('سياق تجريبي', 'Synthetic context'))}</section>` : ''}${patient ? `<section class="alert info"><h2>${t('عرض تصميم مشروط', 'Conditional design preview')}</h2><p>${t('سياسة عرض الوصفة وسجل الأدوية المقترحة لم تعتمد بعد. الحالة الموجبة هنا مثال للمراجعة وليست صلاحية قائمة.', 'The proposed prescription and medication release policy is not approved. Positive views here are review examples, not existing permission.')}</p></section>` : ''}${alert()}${actionGate()}${body}<p class="footer">${t('مرجع تصميم فقط. الأزرار لا تنفذ إجراءات. لا موافقة سريرية أو قانونية أو تشغيلية.', 'Design reference only. Controls execute no action. No clinical, legal or operational approval.')}</p></main>${patient ? `<div class="patient-dock"><div class="help-row"><p class="scroll-cue">${t('مرّر للتفاصيل', 'Scroll for details')}</p><button type="button" class="sos" aria-disabled="true" aria-label="${t('طلب مساعدة طارئة — مرجع تصميم فقط', 'Emergency assistance — design reference only')}">${t('مساعدة', 'Help')}</button></div><nav class="bottom" aria-label="${t('التنقل الرئيسي', 'Primary navigation')}"><a href="?family=prescription&state=ready&locale=${locale}">${t('الوصفات', 'Prescriptions')}</a><a href="?family=medications&state=ready&locale=${locale}">${t('سجل الأدوية', 'Medication records')}</a></nav></div>` : ''}</div></div>`;
document.title = `SHIFAA — ${txt[family]} — ${state}`;

if (patient) {
  const dock = document.querySelector('.patient-dock');
  const root = document.getElementById('root');
  const scrollport = document.createElement('div');
  scrollport.className = 'patient-scrollport';
  scrollport.setAttribute('role', 'region');
  scrollport.setAttribute(
    'aria-label',
    t('محتوى السجل القابل للتمرير', 'Scrollable record content'),
  );
  const preview = document.querySelector('.preview');
  const shell = document.querySelector('.shell');
  root.insertBefore(scrollport, preview);
  scrollport.append(preview, shell);
  root.append(dock);
  const measureDock = () =>
    document.documentElement.style.setProperty(
      '--patient-dock-height',
      Math.ceil(dock.getBoundingClientRect().height) + 'px',
    );
  new ResizeObserver(measureDock).observe(dock);
  measureDock();
  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      dock.contains(target) ||
      target.classList.contains('skip')
    )
      return;
    requestAnimationFrame(() => {
      const box = target.getBoundingClientRect();
      if (matchMedia('(max-width: 599px)').matches) {
        const port = scrollport;
        if (target === document.getElementById('main')) return;
        const bounds = port.getBoundingClientRect();
        if (box.bottom + 8 > bounds.bottom) port.scrollBy(0, box.bottom - bounds.bottom + 16);
        if (target.getBoundingClientRect().top < bounds.top + 8)
          port.scrollBy(0, target.getBoundingClientRect().top - bounds.top - 16);
        return;
      }
      const top = dock.getBoundingClientRect().top;
      if (box.bottom + 8 > top) window.scrollBy(0, box.bottom - top + 16);
      if (target.getBoundingClientRect().top < 8) target.scrollIntoView({ block: 'start' });
    });
  });
}
window.designReady = true;
