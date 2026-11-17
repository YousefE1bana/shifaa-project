import type { Locale } from './catalogs.ts';

const arEG = {
  sources: {
    present: {
      label: 'معلومة ضمن النطاق المعلن',
      detail: 'تغطية مرتبطة بالمصدر؛ لا استنتاج سريري.',
      next: 'راجع نطاق المصدر وحدود الفحص.',
    },
    verified_empty: {
      label: 'فارغة ضمن النطاق المثبت',
      detail:
        'لا توجد سجلات ضمن مجموعة العرض المصرح بها المكتملة فقط؛ هذا لا يعني عدم وجود أدوية أو حساسية.',
      next: 'راجع النطاق أو حدّث القراءة الحالية.',
    },
    missing: {
      label: 'مفقودة',
      detail: 'لا تُستنتج معلومات من مصدر غير موجود.',
      next: 'اعرض القيد واطلب المصدر عبر المسار المصرح به.',
    },
    unavailable: {
      label: 'غير متاحة',
      detail: 'عدم الإتاحة ليس نتيجة فارغة ولا فحصاً ناجحاً.',
      next: 'أعد القراءة عند عودة المصدر؛ تبقى النسخة المحفوظة سليمة.',
    },
    stale: {
      label: 'قديمة',
      detail: 'المصدر المعروض لا يثبت الصلاحية الحالية.',
      next: 'حدّث المصدر وأعد الفحص قبل أي إجراء يعتمد عليه.',
    },
    partial: {
      label: 'جزئية',
      detail: 'المعلومات المتاحة لا تغطي كل النطاق المطلوب.',
      next: 'راجع التغطية وأعد القراءة؛ لا تعلن اكتمال الفحص.',
    },
  },
  freshnessUnknown: {
    label: 'الحداثة غير معروفة',
    detail: 'وقت العرض لا يثبت وقت تحديث المصدر.',
    next: 'راجع المصدر؛ لا تفترض مدة صلاحية.',
  },
  safety: {
    assessment: 'لم يكتمل التحقق السريري',
    assessmentLimit: 'مطابقة المصدر لا تسمح بالعلاج أو التوقيع السريري.',
    historicalTitle: 'سجل تاريخي — غير صالح للاستخدام الحالي',
    historicalDetail:
      'تُعرض لحفظ التاريخ فقط؛ لا تستخدمها كوصفة حالية ولا كتعليمات علاج. لا يمنح رابط الاستبدال تصريحاً لعرض وصفة أخرى.',
    historicalRelease:
      'لا إتاحة جديدة لوصفة ملغاة أو مستبدلة أو منتهية. الإتاحة السابقة تبقى تاريخية؛ سحبها يحتاج تصريحاً مستقلاً.',
    releaseBlocked: 'إجراءات الإتاحة محظورة.',
    noReleaseAction: 'لا يوجد إجراء إتاحة مسموح من هذه الحالة.',
    caseActionsBlocked: 'إجراءات الحالة محظورة الآن',
    actionRequirements:
      'لن يُتاح الإجراء إلا بعد إثبات شروطه الحالية؛ التحديث وحده لا يمنح التصريح.',
    releaseAuthority:
      'يلزم تصريح مستقل حالي للإتاحة أو السحب، وعلاقة رعاية ومنشأة وغرض حالي. لا تعديل للسجل السريري الموقّع.',
    withdrawalConfirmation:
      'سحب الإتاحة نهائي لنفس السجل المحدد وإصداره؛ ولا يمكن إتاحته مرة أخرى، حتى يدوياً. يمنع السحب القراءات اللاحقة، لكنه لا يمكنه استرجاع معلومات سبق الكشف عنها.',
  },
  blockedActionPrefix: 'محظور: ',
  actions: {
    confirmRelease: 'تأكيد إتاحة الأهداف المحددة',
    confirmWithdrawal: 'تأكيد سحب الهدف المحدد',
    confirmSigning: 'تأكيد التوقيع مع الاختيارات الصريحة',
    reconcileOriginalKey: 'التحقق بالمفتاح الأصلي',
    refreshAuthorizedState: 'تحديث الحالة المصرّح بها',
    readCurrentState: 'عرض الحالة الحالية المصرّح بها',
    readAndReconcile: 'قراءة الحالة ومصالحة النتيجة أولاً',
    refreshSourceState: 'تحديث حالة المصدر',
    backToRecords: 'العودة إلى السجلات',
  },
  releaseChoices: {
    prescription: 'الوصفة الموقعة',
    prescribedMedication: 'سجل الدواء الموصوف المحدد',
  },
  accessibleNames: {
    receipt: 'إيصال نتيجة تجريبية',
    recordContent: 'محتوى السجل القابل للتمرير',
    viewingContext: 'سياق العرض',
  },
  results: {
    committed: 'نتيجة تجريبية محفوظة',
    released: 'تم تسجيل الإتاحة',
    withdrawn: 'تم سحب الإتاحة',
  },
  receiptFields: {
    status: 'الحالة',
    reference: 'المرجع',
    time: 'الوقت',
    next: 'الخطوة التالية',
  },
  errors: {
    denied: {
      title: 'لا يتوفر تصريح حالي للعرض أو الإجراء',
      detail: 'لا تُعرض تفاصيل السجل أو وجود مصادر محجوبة.',
      next: 'ارجع إلى سياق مصرح به.',
    },
    revoked: {
      title: 'انتهت الصلاحية الحالية',
      detail: 'التكليف أو الجلسة السابقة لا يمنحان استمرار الوصول.',
      next: 'ارجع إلى سياق حالي مصرح به.',
    },
    withdrawn: {
      title: 'الوصول إلى العرض غير متاح',
      detail: 'لا يمكن متابعة عرض سجل دون صلاحية حالية.',
      next: 'ارجع إلى السجلات المصرّح بها.',
    },
    recoverable_error: {
      title: 'تعذّر إكمال الطلب',
      detail: 'النسخة المحفوظة سابقاً باقية. لا يُفترض نجاح التغيير.',
      next: 'أعد القراءة ثم أعد المحاولة بنفس مفتاح الطلب عند المصالحة.',
    },
    fatal_error: {
      title: 'تعذّر التحقق من سلامة الحالة',
      detail: 'الإجراءات متوقفة؛ لا يمكن الاعتماد على حالة غير مثبتة.',
      next: 'ارجع واتصل بمسؤول بيئة التدريب.',
    },
    offline: {
      title: 'الاتصال غير متاح',
      detail: 'لا تُحفظ إجراءات الوصفات للمزامنة لاحقاً.',
      next: 'أعد الاتصال ثم حدّث الحالة المصرّح بها.',
    },
    conflict: {
      title: 'تغيّرت النسخة أثناء العمل',
      detail: 'تحديث النسخة لا يعيد ربط الأدلة أو الموافقات تلقائياً.',
      next: 'حدّث الحالة وراجع التغييرات؛ لا تكرر إجراءً غير مؤكد بمفتاح جديد.',
    },
    uncertain: {
      title: 'نتيجة الطلب غير مؤكدة',
      detail: 'فقدان الرد لا يثبت التراجع عن الحفظ.',
      next: 'تحقق من نتيجة المفتاح الأصلي بتصريح حالي. لا تستخدم مفتاحاً جديداً ولا تفترض الفشل.',
    },
    step_up: {
      title: 'يلزم تحقق حديث بعامل إضافي',
      detail: 'صلاحية العامل منفصلة عن وقت إصدار الرمز.',
      next: 'أكمل التحقق ثم أعد قراءة الحالة الحالية.',
    },
    producer_failure: {
      title: 'لم ينتج فحص السلامة نتيجة مطلوبة',
      detail: 'لا حفظ جزئي ناجح ولا فحص ناجح وهمي؛ المسودة السابقة باقية.',
      next: 'استعد المصدر ثم أعد العملية المصرح بها.',
    },
  },
};

const enEG: typeof arEG = {
  sources: {
    present: {
      label: 'Known within declared scope',
      detail: 'Source-bound coverage; no clinical inference.',
      next: 'Review the source scope and assessment limits.',
    },
    verified_empty: {
      label: 'Verified empty within scope',
      detail:
        'No records exist within this complete authorized projection scope only; this does not establish absence of medications or allergies.',
      next: 'Review the scope or refresh the authorized read.',
    },
    missing: {
      label: 'Missing',
      detail: 'No facts are inferred from a missing source.',
      next: 'Show the limitation and obtain the source through an authorized path.',
    },
    unavailable: {
      label: 'Unavailable',
      detail: 'Unavailability is neither an empty result nor a successful check.',
      next: 'Retry when the source returns; committed drafts remain intact.',
    },
    stale: {
      label: 'Stale',
      detail: 'The displayed source does not establish current eligibility.',
      next: 'Refresh evidence and rerun checks before relying on it.',
    },
    partial: {
      label: 'Partial',
      detail: 'Available information does not cover the full required scope.',
      next: 'Review coverage and reread; do not claim a complete check.',
    },
  },
  freshnessUnknown: {
    label: 'Freshness unknown',
    detail: 'The display time does not establish when the producer updated its data.',
    next: 'Review the source; do not assume a freshness interval.',
  },
  safety: {
    assessment: 'Clinical assessment not fully checked',
    assessmentLimit: 'Source matching does not authorize treatment or clinical signing.',
    historicalTitle: 'Historical record — not valid for current use',
    historicalDetail:
      'Shown to preserve history only; do not use it as a current prescription or treatment instruction. A replacement link grants no access to another prescription.',
    historicalRelease:
      'No new release for cancelled, superseded or expired prescriptions. Prior release stays historical; withholding it requires independent permission.',
    releaseBlocked: 'Release actions blocked.',
    noReleaseAction: 'No release action is permitted from this state.',
    caseActionsBlocked: 'Case actions are blocked now',
    actionRequirements:
      'Actions become available only after current prerequisites are proven; refresh alone grants no authority.',
    releaseAuthority:
      'Requires distinct current release or withdrawal permission, care/facility/purpose. No signed clinical record edits.',
    withdrawalConfirmation:
      'Withdrawal is terminal for the same target and revision. It cannot be released again, including manually. Withdrawal denies later reads, but cannot recall information already disclosed.',
  },
  blockedActionPrefix: 'Blocked: ',
  actions: {
    confirmRelease: 'Confirm selected release',
    confirmWithdrawal: 'Confirm selected withdrawal',
    confirmSigning: 'Confirm signing with explicit choices',
    reconcileOriginalKey: 'Reconcile original key',
    refreshAuthorizedState: 'Refresh authorized state',
    readCurrentState: 'Read current authorized state',
    readAndReconcile: 'Read state and reconcile first',
    refreshSourceState: 'Refresh source state',
    backToRecords: 'Back to records',
  },
  releaseChoices: {
    prescription: 'Signed prescription',
    prescribedMedication: 'Selected prescribed medication record',
  },
  accessibleNames: {
    receipt: 'Exercise outcome receipt',
    recordContent: 'Scrollable record content',
    viewingContext: 'Viewing context',
  },
  results: {
    committed: 'Committed exercise outcome',
    released: 'Release recorded',
    withdrawn: 'Release withdrawn',
  },
  receiptFields: {
    status: 'Status',
    reference: 'Reference',
    time: 'Time',
    next: 'Next step',
  },
  errors: {
    denied: {
      title: 'Current access is not authorized',
      detail: 'Record details and hidden-source existence are not disclosed.',
      next: 'Return to an authorized context.',
    },
    revoked: {
      title: 'Current authority is no longer valid',
      detail: 'A previous assignment or session does not continue to authorize access.',
      next: 'Return to a currently authorized context.',
    },
    withdrawn: {
      title: 'Projection access is unavailable',
      detail: 'A record cannot remain visible without current authorization.',
      next: 'Return to authorized records.',
    },
    recoverable_error: {
      title: 'The request could not complete',
      detail: 'The previously committed version remains. A successful change is not assumed.',
      next: 'Refresh, then reconcile using the original request key.',
    },
    fatal_error: {
      title: 'State integrity could not be established',
      detail: 'Actions are blocked; unproven state cannot be relied on.',
      next: 'Return and contact the training-environment operator.',
    },
    offline: {
      title: 'Connection unavailable',
      detail: 'Prescription mutations are not queued for later synchronization.',
      next: 'Reconnect, then refresh authorized state.',
    },
    conflict: {
      title: 'The version changed during this action',
      detail: 'Refreshing a version does not silently rebind evidence or approvals.',
      next: 'Refresh and review changes; do not retry an uncertain action with a new key.',
    },
    uncertain: {
      title: 'Request outcome is uncertain',
      detail: 'A lost response does not prove the transaction rolled back.',
      next: 'Reconcile the original key under current authority. Do not use a new key or assume failure.',
    },
    step_up: {
      title: 'Fresh factor authentication required',
      detail: 'Factor freshness is distinct from token issuance time.',
      next: 'Complete step-up, then refresh current state.',
    },
    producer_failure: {
      title: 'Safety producer did not produce the required outcome',
      detail:
        'No partial successful save or fabricated check result; the previous draft remains intact.',
      next: 'Recover the source, then retry the authorized operation.',
    },
  },
};

export const feature012Copy = {
  'ar-EG': arEG,
  'en-EG': enEG,
} satisfies Record<Locale, typeof arEG>;

export type Feature012Action = keyof typeof arEG.actions;
export type Feature012Result = keyof typeof arEG.results;

export function feature012ActionName(locale: Locale, action: Feature012Action, blocked = false) {
  const copy = feature012Copy[locale];
  return blocked ? copy.blockedActionPrefix + copy.actions[action] : copy.actions[action];
}
