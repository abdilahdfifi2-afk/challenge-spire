// Translate raw Postgres error messages (from SECURITY DEFINER RPC EXCEPTIONs)
// into human-readable Arabic messages for toasts.

const MAP: Record<string, string> = {
  not_authenticated: "يجب تسجيل الدخول أولاً",
  forbidden: "لا تملك الصلاحية لهذا الإجراء",
  wallet_not_found: "لم يتم العثور على محفظة",
  insufficient_funds: "الرصيد المتاح لا يكفي",
  invalid_entry_fee: "قيمة الرسوم غير صالحة",
  entry_fee_out_of_range: "قيمة الرسوم خارج الحدود المسموح بها",
  invalid_amount: "المبلغ غير صالح",
  amount_out_of_range: "المبلغ خارج الحد الأدنى/الأقصى المسموح",
  challenge_not_found: "التحدي غير موجود",
  challenge_not_open: "التحدي غير مفتوح للانضمام",
  cannot_join_own_challenge: "لا يمكنك قبول تحديك الخاص",
  challenge_full: "التحدي مكتمل بالفعل",
  cannot_cancel: "لا يمكن إلغاء التحدي في هذه المرحلة",
  not_participant: "لست طرفاً في هذا التحدي",
  not_active: "التحدي غير نشط حالياً",
  invalid_winner: "الفائز المُختار غير صالح",
  already_submitted: "قدّمت نتيجتك من قبل",
  deposit_not_found: "طلب الإيداع غير موجود",
  withdrawal_not_found: "طلب السحب غير موجود",
  dispute_not_found: "النزاع غير موجود",
  already_resolved: "تم حل النزاع مسبقاً",
  not_pending: "هذا الطلب لم يعد معلّقاً",
};

export function translateFinancialError(raw?: string | null): string {
  if (!raw) return "حدث خطأ غير متوقع";
  for (const key of Object.keys(MAP)) {
    if (raw.includes(key)) return MAP[key];
  }
  return raw;
}
