/** Arabic-first, English-parity copy for the eight Feature 009 route families. */

export const clinicSchedulingArEG = {
  'clinic.route.discover.title': 'اكتشاف الأطباء',
  'clinic.route.discover.description': 'ابحث عن طبيب مرخّص في منشأة موثّقة.',
  'clinic.route.doctor.title': 'تفاصيل الطبيب والتوافر',
  'clinic.route.doctor.description': 'راجع التوافر الحالي ورسوم المنشأة قبل المتابعة.',
  'clinic.route.appointmentNew.title': 'تأكيد الموعد',
  'clinic.route.appointmentNew.description': 'راجع سياق المريض والوقت والرسوم قبل التأكيد.',
  'clinic.route.appointment.title': 'تفاصيل الموعد',
  'clinic.route.appointment.description': 'اعرض حالة الموعد وإجراءاتها المسموح بها.',
  'clinic.route.today.title': 'عمل اليوم في العيادة',
  'clinic.route.today.description': 'راجع قائمة العمل حسب المنشأة والطبيب والتاريخ.',
  'clinic.route.queue.title': 'قائمة الانتظار',
  'clinic.route.queue.description': 'تابع ترتيب الانتظار والإجراءات المصرّح بها.',
  'clinic.route.schedule.title': 'جدول العيادة',
  'clinic.route.schedule.description': 'أدر النوافذ الزمنية والاستثناءات ضمن النطاق المصرّح.',
  'clinic.route.clinicAppointment.title': 'موعد العيادة',
  'clinic.route.clinicAppointment.description': 'راجع أقل قدر لازم من تفاصيل الموعد وسياقه.',

  'clinic.appointment.status.requested': 'مطلوب',
  'clinic.appointment.status.confirmed': 'مؤكّد',
  'clinic.appointment.status.checked_in': 'تم تسجيل الحضور',
  'clinic.appointment.status.in_queue': 'في قائمة الانتظار',
  'clinic.appointment.status.in_consultation': 'قيد الاستشارة',
  'clinic.appointment.status.completed': 'مكتمل',
  'clinic.appointment.status.cancelled': 'ملغى',
  'clinic.appointment.status.no_show': 'لم يحضر',
  'clinic.appointment.status.reschedule_required': 'يلزم إعادة الجدولة',

  'clinic.queue.status.waiting': 'ينتظر',
  'clinic.queue.status.called': 'تم النداء',
  'clinic.queue.status.in_service': 'قيد الخدمة',
  'clinic.queue.status.completed': 'مكتملة',
  'clinic.queue.status.removed': 'أزيلت من القائمة',

  'clinic.payment.cashOnArrival': 'الدفع نقدًا عند الوصول',
  'clinic.payment.cashInstruction': 'الطريقة المتاحة في هذه المرحلة هي الدفع نقدًا عند الوصول.',
  'clinic.payment.noDigitalPayment': 'لا يتوفر دفع رقمي أو بطاقة أو محفظة في هذه المرحلة.',
  'clinic.confirm.bookingTitle': 'تأكيد حجز الموعد',
  'clinic.confirm.bookingHelp': 'تأكد من المريض والوقت والرسوم وطريقة الدفع قبل التأكيد.',
  'clinic.confirm.cancelTitle': 'تأكيد إلغاء الموعد',
  'clinic.confirm.cancelHelp': 'سيؤدي الإلغاء إلى تحرير الوقت ولا يمكن التراجع عنه من هذه الشاشة.',
  'clinic.confirm.rescheduleTitle': 'تأكيد إعادة الجدولة',
  'clinic.confirm.rescheduleHelp': 'سيُحجز الوقت البديل أولًا ثم يُحرر الوقت السابق.',
  'clinic.confirm.queueAction': 'تأكيد إجراء قائمة الانتظار',

  'clinic.result.success': 'تم حفظ الإجراء بنجاح.',
  'clinic.result.reference': 'المرجع: {reference}',
  'clinic.result.time': 'الوقت: {timestamp}',
  'clinic.result.nextStep': 'الخطوة التالية: {nextStep}',
  'clinic.result.delayPending': 'تم تسجيل التأخير؛ حالة الإشعار قيد المتابعة دون ادعاء التسليم.',
  'clinic.result.absence': 'يتطلب هذا الموعد إعادة الجدولة. اختر وقتًا بديلًا حاليًا.',
  'clinic.result.noSlotHeld': 'الوقت البديل المقترح غير محجوز لك بعد.',

  'clinic.state.loading': 'جارٍ تحميل بيانات العيادة…',
  'clinic.state.empty': 'لا توجد نتائج مطابقة للنطاق الحالي.',
  'clinic.state.error': 'تعذر تحميل البيانات الآن. راجع الحالة ثم حاول مرة أخرى.',
  'clinic.state.offline': 'لا يوجد اتصال. لم نضع أي إجراء في قائمة انتظار ولم نغيّر الحالة.',
  'clinic.state.stale': 'قد تكون البيانات قديمة. أعد التحميل قبل المتابعة.',
  'clinic.state.conflict': 'تغيّرت النسخة الحالية. حدّث البيانات ثم حاول بإجراء مقصود جديد.',
  'clinic.state.success': 'اكتمل الإجراء وتظهر النتيجة الحالية من الخادم.',
  'clinic.state.permission': 'ليس لديك الصلاحية أو النطاق الحالي لهذا الإجراء.',
  'clinic.state.unavailable': 'الخدمة غير متاحة الآن. لم يتم تأكيد أي نتيجة جديدة.',
  'clinic.state.retry': 'حاول مرة أخرى',
  'clinic.state.refresh': 'تحديث البيانات الحالية',

  'clinic.queue.position': 'موضعك الحالي: {position}',
  'clinic.queue.estimate': 'التقدير الحالي: {timestamp}',
  'clinic.queue.lastUpdated': 'آخر تحديث: {timestamp}',
  'clinic.queue.mayBeOutdated': 'قد تكون هذه المعلومات قديمة.',
  'clinic.queue.reorderReason': 'سبب إعادة الترتيب',
  'clinic.queue.reorderRestricted': 'لا يمكن إعادة ترتيب إلا عنصر انتظار مصرحًا به وبسبب محدد.',
  'clinic.schedule.overlap': 'يتعارض الوقت مع فترة أخرى؛ يلامس الحد الزمني دون تداخل مسموح.',
  'clinic.schedule.delayOverlay': 'التأخير الحالي يؤثر في التقدير فقط ولا يغيّر وقت الموعد.',
  'clinic.schedule.absenceScope': 'يطبق الغياب على الطبيب والمنشأة والتاريخ والفترة المحددة فقط.',
  'clinic.notification.governedCandidate': 'إشعار عربي/إنجليزي مرشح يخضع لدورة اعتماد مستقلة.',
  'clinic.notification.productionDisabled': 'الإرسال الإنتاجي غير مفعّل؛ لا ندّعي تسليم إشعار.',
} as const;

export const clinicSchedulingEnEG: Record<keyof typeof clinicSchedulingArEG, string> = {
  'clinic.route.discover.title': 'Discover doctors',
  'clinic.route.discover.description': 'Search for a licensed doctor at a verified facility.',
  'clinic.route.doctor.title': 'Doctor details and availability',
  'clinic.route.doctor.description':
    'Review current availability and facility fees before continuing.',
  'clinic.route.appointmentNew.title': 'Confirm appointment',
  'clinic.route.appointmentNew.description':
    'Review patient context, time, and fee before confirming.',
  'clinic.route.appointment.title': 'Appointment details',
  'clinic.route.appointment.description': 'View the appointment state and its permitted actions.',
  'clinic.route.today.title': "Today's clinic worklist",
  'clinic.route.today.description': 'Review work scoped to the facility, doctor, and civil date.',
  'clinic.route.queue.title': 'Queue',
  'clinic.route.queue.description': 'Follow queue order and the actions currently permitted.',
  'clinic.route.schedule.title': 'Clinic schedule',
  'clinic.route.schedule.description':
    'Manage time windows and exceptions within the authorized scope.',
  'clinic.route.clinicAppointment.title': 'Clinic appointment',
  'clinic.route.clinicAppointment.description':
    'Review the minimum appointment and context projection.',

  'clinic.appointment.status.requested': 'Requested',
  'clinic.appointment.status.confirmed': 'Confirmed',
  'clinic.appointment.status.checked_in': 'Checked in',
  'clinic.appointment.status.in_queue': 'In queue',
  'clinic.appointment.status.in_consultation': 'In consultation',
  'clinic.appointment.status.completed': 'Completed',
  'clinic.appointment.status.cancelled': 'Cancelled',
  'clinic.appointment.status.no_show': 'No-show',
  'clinic.appointment.status.reschedule_required': 'Reschedule required',

  'clinic.queue.status.waiting': 'Waiting',
  'clinic.queue.status.called': 'Called',
  'clinic.queue.status.in_service': 'In service',
  'clinic.queue.status.completed': 'Completed',
  'clinic.queue.status.removed': 'Removed',

  'clinic.payment.cashOnArrival': 'Cash on arrival',
  'clinic.payment.cashInstruction':
    'Cash on arrival is the only enabled payment method at this stage.',
  'clinic.payment.noDigitalPayment':
    'Digital, card, and wallet payments are not available at this stage.',
  'clinic.confirm.bookingTitle': 'Confirm appointment booking',
  'clinic.confirm.bookingHelp':
    'Confirm the patient, time, fee, and payment method before booking.',
  'clinic.confirm.cancelTitle': 'Confirm appointment cancellation',
  'clinic.confirm.cancelHelp':
    'Cancellation releases the time and cannot be undone from this screen.',
  'clinic.confirm.rescheduleTitle': 'Confirm rescheduling',
  'clinic.confirm.rescheduleHelp':
    'The replacement time is acquired before the previous time is released.',
  'clinic.confirm.queueAction': 'Confirm queue action',

  'clinic.result.success': 'The action was saved successfully.',
  'clinic.result.reference': 'Reference: {reference}',
  'clinic.result.time': 'Time: {timestamp}',
  'clinic.result.nextStep': 'Next step: {nextStep}',
  'clinic.result.delayPending':
    'The delay was recorded; notification status is being followed without a delivery claim.',
  'clinic.result.absence':
    'This appointment requires rescheduling. Choose a current replacement time.',
  'clinic.result.noSlotHeld': 'The suggested replacement time is not held for you yet.',

  'clinic.state.loading': 'Loading clinic data…',
  'clinic.state.empty': 'No results match the current scope.',
  'clinic.state.error': 'The data could not be loaded. Review the state and try again.',
  'clinic.state.offline': 'You are offline. No action was queued and no state was changed.',
  'clinic.state.stale': 'This data may be outdated. Refresh before continuing.',
  'clinic.state.conflict':
    'The current version changed. Refresh and submit a new intentional action.',
  'clinic.state.success': 'The action completed; the current server result is shown.',
  'clinic.state.permission': 'You do not have permission or the current scope for this action.',
  'clinic.state.unavailable': 'The service is unavailable. No new outcome was confirmed.',
  'clinic.state.retry': 'Try again',
  'clinic.state.refresh': 'Refresh current data',

  'clinic.queue.position': 'Your current position: {position}',
  'clinic.queue.estimate': 'Current estimate: {timestamp}',
  'clinic.queue.lastUpdated': 'Last updated: {timestamp}',
  'clinic.queue.mayBeOutdated': 'This information may be outdated.',
  'clinic.queue.reorderReason': 'Reason for reorder',
  'clinic.queue.reorderRestricted':
    'Only an authorized waiting entry with a stated reason can be reordered.',
  'clinic.schedule.overlap':
    'The time conflicts with another interval; touching a boundary is not overlap.',
  'clinic.schedule.delayOverlay':
    'The current delay affects the estimate only and does not change appointment time.',
  'clinic.schedule.absenceScope':
    'Absence applies only to the selected doctor, facility, date, and interval.',
  'clinic.notification.governedCandidate':
    'A bilingual candidate notice requiring an independent approval lifecycle.',
  'clinic.notification.productionDisabled':
    'Production delivery is disabled; no notification delivery is claimed.',
};

/** Isolate dynamic references, timestamps, and numbers when rendered inside RTL text. */
export function interpolateClinicScheduling(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : `\u2066${String(value)}\u2069`;
  });
}

export const clinicSchedulingMessageKeys = Object.keys(clinicSchedulingArEG) as Array<
  keyof typeof clinicSchedulingArEG
>;
