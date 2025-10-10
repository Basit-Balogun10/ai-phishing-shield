import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Language =
  | 'english'
  | 'yoruba'
  | 'igbo'
  | 'hausa'
  | 'swahili'
  | 'pidgin'
  | 'french'
  | 'arabic'
  | 'amharic';

type ScamType = string;

type Country = 'nigeria' | 'kenya' | 'tanzania' | 'senegal' | 'ivorycoast' | 'egypt' | 'ethiopia';

type Currency = 'NGN' | 'KES' | 'XOF' | 'EGP' | 'ETB';

type DatasetRecord = {
  message: string;
  label: 'phishing' | 'legitimate';
  language: Language;
  scam_type: ScamType;
  source: 'synthetic';
};

interface GenerateOptions {
  numPhishing?: number;
  numLegitimate?: number;
}

interface SaveOptions {
  format?: 'csv' | 'json';
}

const DEFAULT_OUTPUT_DIR = 'phishing_dataset';

const SERVICES: Record<Language, readonly string[]> = {
  english: [
    'MTN Mobile Money',
    'Airtel Money',
    'M-Pesa',
    'First Bank',
    'GTBank',
    'Access Bank',
    'UBA',
  ],
  yoruba: [
    'MTN Mobile Money',
    'Airtel Money',
    'M-Pesa',
    'Ile-iṣowo First Bank',
    'GTBank',
    'Access Bank',
  ],
  igbo: ['MTN Mobile Money', 'Airtel Money', 'M-Pesa', 'First Bank', 'GTBank', 'Ụlọ akụ Access'],
  hausa: ['MTN Mobile Money', 'Airtel Money', 'M-Pesa', 'Bankin First', 'GTBank', 'Access Bank'],
  swahili: ['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Vodacom M-Pesa', 'Benki ya Kenya'],
  pidgin: ['MTN Mobile Money', 'Airtel Money', 'M-Pesa', 'First Bank', 'GTBank', 'Access Bank'],
  french: [
    'MTN Mobile Money',
    'Orange Money',
    'Moov Money',
    'Wave',
    'Banque Atlantique',
    'Ecobank',
  ],
  arabic: ['فودافون كاش', 'أورنج موني', 'MTN Mobile Money', 'بنك مصر', 'البنك الأهلي'],
  amharic: ['M-BIRR', 'HelloCash', 'CBE Birr', 'አምሃራ ባንክ', 'ንግድ ባንክ'],
};

const PHONE_PREFIXES: Record<Country, readonly string[]> = {
  nigeria: ['0803', '0806', '0810', '0813', '0816', '0703'],
  kenya: ['0701', '0702', '0710', '0720'],
  tanzania: ['0714', '0715', '0754', '0755'],
  senegal: ['77', '78', '76', '70'],
  ivorycoast: ['07', '05', '01'],
  egypt: ['010', '011', '012', '015'],
  ethiopia: ['091', '092', '093', '094'],
};

const LANG_CONFIG: Record<Language, { country: Country; currency: Currency }> = {
  yoruba: { country: 'nigeria', currency: 'NGN' },
  igbo: { country: 'nigeria', currency: 'NGN' },
  hausa: { country: 'nigeria', currency: 'NGN' },
  pidgin: { country: 'nigeria', currency: 'NGN' },
  swahili: { country: 'kenya', currency: 'KES' },
  french: { country: 'senegal', currency: 'XOF' },
  arabic: { country: 'egypt', currency: 'EGP' },
  amharic: { country: 'ethiopia', currency: 'ETB' },
  english: { country: 'nigeria', currency: 'NGN' },
};

const LEGITIMATE_NAMES = ['John Doe', 'Jane Smith', 'DSTV', 'EKEDC'] as const;

function randomChoice<T>(items: readonly T[]): T {
  if (!items.length) {
    throw new Error('Cannot choose from an empty array');
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index] as T;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatCsvValue(value: string): string {
  const needsEscaping = value.includes(',') || value.includes('"') || value.includes('\n');
  if (!needsEscaping) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

export class PhishingDatasetGenerator {
  private readonly templates: Record<Language, Record<ScamType, readonly string[]>>;

  constructor() {
    this.templates = this.initializeTemplates();
  }

  private initializeTemplates(): Record<Language, Record<ScamType, readonly string[]>> {
    return {
      english: this.getEnglishTemplates(),
      yoruba: this.getYorubaTemplates(),
      igbo: this.getIgboTemplates(),
      hausa: this.getHausaTemplates(),
      swahili: this.getSwahiliTemplates(),
      pidgin: this.getPidginTemplates(),
      french: this.getFrenchTemplates(),
      arabic: this.getArabicTemplates(),
      amharic: this.getAmharicTemplates(),
    };
  }

  private getEnglishTemplates(): Record<ScamType, readonly string[]> {
    return {
      account_suspension: [
        'URGENT: Your {service} account has been suspended due to unusual activity. Click {url} to verify within 24hrs or lose access permanently.',
        'ALERT: We detected suspicious login to your {service} account. Verify now at {url} or your account will be blocked.',
        'ACTION REQUIRED: Your {service} account will be deactivated in {hours} hours. Update your details at {url}',
        '{service} SECURITY: Unusual transaction detected. Confirm your identity at {url} immediately.',
        'FINAL WARNING: Your {service} account suspended. Restore access: {url}. Reply with PIN if link fails.',
      ],
      fake_credit: [
        'Congratulations! You have received {amount} from {service}. Click {url} to claim your funds.',
        'CREDIT ALERT: {amount} credited to your {service} wallet. Verify to withdraw: {url}',
        '{service}: You won {amount} in our customer loyalty promo! Claim at {url}',
        "You've received {amount} from unknown sender. Check transaction at {url}",
        "PROMO ALERT: {service} is giving {amount} to random users. You're selected! Claim: {url}",
      ],
      otp_request: [
        '{service}: Please confirm OTP {otp} to complete transaction. If not initiated by you, call {phone}',
        'Your {service} verification code is {otp}. Share this with our agent at {phone} to verify account',
        'SECURITY CODE: {otp}. {service} customer care needs this to resolve your issue. Call {phone}',
        '{service} sent you verification code {otp}. Reply with this code to activate your account',
        'OTP: {otp}. Your {service} account requires verification. Contact support {phone} with this code',
      ],
      customer_service: [
        '{service} Customer Care: Your account needs update. Call us immediately at {phone}',
        'This is {service} support team. We noticed issues with your account. Reach us on {phone}',
        'URGENT: {service} detected fraud on your account. Contact {phone} NOW to secure your funds',
        '{service} ALERT: System upgrade requires verification. Call {phone} within 2 hours',
        'Your {service} PIN has expired. Call {phone} to reset or visit {url}',
      ],
      help_scam: [
        "Hi, it\'s Mary from the market. I\'m stuck and need {amount} urgently. Please send to {phone}, I\'ll return it tomorrow!",
        "Brother, it's an emergency! I need {amount} for the hospital. Send via {service} to {phone}",
        'Uncle/Aunt, my {service} is having issues. Can you help me receive {amount}? Number: {phone}',
        'Hey, remember me from church? I need help with {amount}. {service}: {phone}',
        'Cousin, my phone crashed. I need {amount} to fix it. Kindly send via {service} to {phone}',
      ],
      prize_lottery: [
        '{service} PROMO: Your number won {amount}! Pay {tax_amount} processing fee to {phone}',
        'WINNER ALERT! Your number has been selected for {amount}. Verify at {url}',
        "CONGRATS! You've won {amount} in the {service} loyalty draw. Claim now at {url}",
      ],
    };
  }

  private getFrenchTemplates(): Record<ScamType, readonly string[]> {
    return {
      account_suspension: [
        "URGENT: Votre compte {service} a été suspendu en raison d'activités inhabituelles. Cliquez sur {url} pour vérifier dans les 24h.",
        'ALERTE: Nous avons détecté une connexion suspecte à votre compte {service}. Vérifiez maintenant sur {url}',
        'ACTION REQUISE: Votre compte {service} sera désactivé dans {hours} heures. Mettez à jour vos informations sur {url}',
        '{service} SÉCURITÉ: Transaction inhabituelle détectée. Confirmez votre identité sur {url} immédiatement.',
        "DERNIER AVERTISSEMENT: Compte {service} suspendu. Restaurez l'accès: {url}. Répondez avec votre PIN si le lien ne fonctionne pas.",
      ],
      fake_credit: [
        'Félicitations! Vous avez reçu {amount} de {service}. Cliquez sur {url} pour réclamer vos fonds.',
        'ALERTE CRÉDIT: {amount} crédité sur votre portefeuille {service}. Vérifiez pour retirer: {url}',
        '{service}: Vous avez gagné {amount} dans notre promo de fidélité! Réclamez sur {url}',
        "Vous avez reçu {amount} d'un expéditeur inconnu. Vérifiez la transaction sur {url}",
        'ALERTE PROMO: {service} offre {amount} aux utilisateurs sélectionnés. Vous êtes choisi! Réclamez: {url}',
      ],
      otp_request: [
        "{service}: Veuillez confirmer le code OTP {otp} pour compléter la transaction. Si ce n'est pas vous, appelez {phone}",
        'Votre code de vérification {service} est {otp}. Partagez-le avec notre agent au {phone}',
        'CODE SÉCURITÉ: {otp}. Le service client {service} en a besoin. Appelez {phone}',
        '{service} vous a envoyé le code {otp}. Répondez avec ce code pour activer votre compte',
        'OTP: {otp}. Votre compte {service} nécessite une vérification. Contactez le support {phone}',
      ],
      customer_service: [
        'Service Client {service}: Votre compte nécessite une mise à jour. Appelez-nous immédiatement au {phone}',
        "C'est l'équipe de support {service}. Nous avons remarqué des problèmes avec votre compte. Contactez-nous au {phone}",
        'URGENT: {service} a détecté une fraude sur votre compte. Contactez {phone} MAINTENANT pour sécuriser vos fonds',
        'ALERTE {service}: La mise à niveau du système nécessite une vérification. Appelez {phone} dans les 2 heures',
        'Votre PIN {service} a expiré. Appelez {phone} pour réinitialiser ou visitez {url}',
      ],
      help_scam: [
        "Bonjour, c'est Fatou. Je suis bloquée et j'ai besoin de {amount} d'urgence. Envoyez à {phone} SVP. Je rembourse demain!",
        "Frère, urgence! J'ai besoin de {amount} pour l'hôpital. Envoyez au numéro {service} {phone}",
        "Oncle/Tante, mon {service} a un problème. Pouvez-vous m'aider à recevoir {amount}? Numéro: {phone}",
        "Salut, tu te souviens de moi de l'église? J'ai besoin d'aide avec {amount}. {service}: {phone}",
        "Cousin, mon téléphone est cassé. J'ai besoin de {amount} pour réparer. Envoie {service} {phone}",
      ],
      prize_lottery: [
        'FÉLICITATIONS! Votre numéro a gagné {amount} dans la promo {service}. Réclamez sur {url}',
        'Vous êtes le gagnant du jour! {service} vous offre {amount}. Cliquez sur {url}',
        '{service} PROMO: Vous avez gagné {amount}! Payez {tax_amount} de frais de traitement à {phone}',
        'ALERTE GAGNANT! Votre numéro a été sélectionné pour {amount}. Vérifiez: {url}',
      ],
    };
  }

  private getArabicTemplates(): Record<ScamType, readonly string[]> {
    return {
      account_suspension: [
        'عاجل: تم تعليق حساب {service} الخاص بك بسبب نشاط غير عادي. انقر {url} للتحقق خلال 24 ساعة',
        'تنبيه: اكتشفنا دخول مشبوه إلى حساب {service} الخاص بك. تحقق الآن على {url}',
        'إجراء مطلوب: سيتم تعطيل حساب {service} الخاص بك في غضون {hours} ساعات. حدّث بياناتك على {url}',
        '{service} الأمان: تم اكتشاف معاملة غير عادية. أكد هويتك على {url} فوراً',
        'تحذير أخير: تم تعليق حساب {service}. استعد الوصول: {url}. رد برقم PIN إذا فشل الرابط',
      ],
      fake_credit: [
        'تهانينا! لقد استلمت {amount} من {service}. انقر {url} للمطالبة بأموالك',
        'تنبيه رصيد: تم إضافة {amount} إلى محفظة {service} الخاصة بك. تحقق للسحب: {url}',
        '{service}: لقد فزت بـ {amount} في عرض ولاء العملاء! طالب به على {url}',
        'لقد استلمت {amount} من مرسل غير معروف. تحقق من المعاملة على {url}',
        'تنبيه عرض: {service} يقدم {amount} لمستخدمين عشوائيين. تم اختيارك! طالب به: {url}',
      ],
      otp_request: [
        '{service}: يرجى تأكيد رمز OTP {otp} لإكمال المعاملة. إذا لم تكن أنت، اتصل بـ {phone}',
        'رمز التحقق من {service} الخاص بك هو {otp}. شاركه مع وكيلنا على {phone}',
        'رمز الأمان: {otp}. خدمة عملاء {service} بحاجة إليه. اتصل بـ {phone}',
        '{service} أرسل لك رمز التحقق {otp}. رد بهذا الرمز لتفعيل حسابك',
        'OTP: {otp}. حساب {service} الخاص بك يتطلب التحقق. اتصل بالدعم {phone}',
      ],
      customer_service: [
        'خدمة عملاء {service}: حسابك يحتاج إلى تحديث. اتصل بنا فوراً على {phone}',
        'هذا فريق دعم {service}. لاحظنا مشاكل في حسابك. اتصل بنا على {phone}',
        'عاجل: {service} اكتشف احتيالاً على حسابك. اتصل بـ {phone} الآن لتأمين أموالك',
        'تنبيه {service}: ترقية النظام تتطلب التحقق. اتصل بـ {phone} خلال ساعتين',
        'انتهت صلاحية رقم PIN الخاص بـ {service}. اتصل بـ {phone} لإعادة التعيين أو قم بزيارة {url}',
      ],
      help_scam: [
        'مرحباً، أنا فاطمة. أنا عالقة وأحتاج {amount} بشكل عاجل. أرسل إلى {phone} من فضلك. سأرد غداً!',
        'أخي، حالة طارئة! أحتاج {amount} للمستشفى. أرسل إلى رقم {service} {phone}',
        'عمي/عمتي، {service} الخاص بي به مشكلة. هل يمكنك مساعدتي في استلام {amount}؟ الرقم: {phone}',
        'مرحباً، هل تتذكرني من المسجد؟ أحتاج مساعدة بـ {amount}. {service}: {phone}',
        'ابن عم، هاتفي معطل. أحتاج {amount} للإصلاح. أرسل {service} {phone}',
      ],
      prize_lottery: [
        'تهانينا! رقمك فاز بـ {amount} في عرض {service}. طالب به على {url}',
        'أنت الفائز اليوم! {service} يقدم لك {amount}. انقر {url} للاستلام',
        '{service} عرض: لقد فزت بـ {amount}! ادفع {tax_amount} رسوم معالجة إلى {phone}',
        'تنبيه فائز! تم اختيار رقم هاتفك لـ {amount}. تحقق: {url}',
      ],
    };
  }

  private getAmharicTemplates(): Record<ScamType, readonly string[]> {
    return {
      account_suspension: [
        'አስቸኳይ: የእርስዎ {service} መለያ ባልተለመደ እንቅስቃሴ ምክንያት ታግዷል። በ24 ሰዓት ውስጥ ለማረጋገጥ {url} ይጫኑ',
        'ማስጠንቀቂያ: በእርስዎ {service} መለያ ላይ አጠራጣሪ መግባት አግኝተናል። አሁኑኑ በ {url} ላይ ያረጋግጡ',
        'እርምጃ ያስፈልጋል: የእርስዎ {service} መለያ በ {hours} ሰዓት ውስጥ ይዘጋል። መረጃዎን በ {url} ያዘምኑ',
        '{service} ደህንነት: ያልተለመደ ግብይት ተገኝቷል። መታወቂያዎን በ {url} ላይ ወዲያውኑ ያረጋግጡ',
        'የመጨረሻ ማስጠንቀቂያ: {service} መለያ ታግዷል። መዳረሻን መልስ: {url}። አገናኙ ካልሰራ በPIN ይመልሱ',
      ],
      fake_credit: [
        'እንኳን ደስ አለዎት! ከ {service} {amount} ተቀብለዋል። ገንዘብዎን ለማግኘት {url} ይጫኑ',
        'የክሬዲት ማስጠንቀቂያ: {amount} ወደ {service} ቦርሳዎ ገብቷል። ለማውጣት ያረጋግጡ: {url}',
        '{service}: በደንበኛ ታማኝነት ማስተዋወቂያችን ውስጥ {amount} አሸንፈዋል! በ {url} ላይ ያገኙ',
        'ከማያውቋቸው ላኪ {amount} ተቀብለዋል። ግብይቱን በ {url} ላይ ይመልከቱ',
        'የማስተዋወቂያ ማስጠንቀቂያ: {service} ለዘፈቀደ ተጠቃሚዎች {amount} እየሰጠ ነው። ተመርጠዋል! ያገኙ: {url}',
      ],
      otp_request: [
        '{service}: ግብይቱን ለማጠናቀቅ እባክዎ OTP {otp} ያረጋግጡ። እርስዎ ካልሆነ {phone} ይደውሉ',
        'የእርስዎ {service} የማረጋገጫ ኮድ {otp} ነው። ይህንን ከወኪላችን ጋር በ {phone} ላይ ያጋሩ',
        'የደህንነት ኮድ: {otp}። {service} የደንበኞች እንክብካቤ ይህን ያስፈልጋል። {phone} ይደውሉ',
        '{service} የማረጋገጫ ኮድ {otp} ላከልዎ። መለያዎን ለማግበር በዚህ ኮድ ይመልሱ',
        'OTP: {otp}። የእርስዎ {service} መለያ ማረጋገጫ ያስፈልጋል። ድጋፍን {phone} ያነጋግሩ',
      ],
      customer_service: [
        '{service} የደንበኞች እንክብካቤ: መለያዎ ማዘመን ያስፈልጋል። ወዲያውኑ በ {phone} ላይ ይደውሉልን',
        'ይህ {service} ድጋፍ ቡድን ነው። በመለያዎ ላይ ችግሮችን አስተውለናል። በ {phone} ላይ ያግኙን',
        'አስቸኳይ: {service} በመለያዎ ላይ ማጭበርበር አግኝቷል። ገንዘብዎን ለመጠበቅ አሁን {phone} ይደውሉ',
        '{service} ማስጠንቀቂያ: የስርዓት ማሻሻያ ማረጋገጫ ያስፈልጋል። በ2 ሰዓት ውስጥ {phone} ይደውሉ',
        'የእርስዎ {service} PIN ጊዜው አልፎበታል። ለመቀየር {phone} ይደውሉ ወይም {url} ይጎብኙ',
      ],
      help_scam: [
        'ሰላም፣ እኔ አለማየሁ ነኝ። ተጣብቄ ነው እና በአስቸኳይ {amount} እፈልጋለሁ። እባክዎን ወደ {phone} ይላኩ። ነገ እመልሳለሁ!',
        'ወንድሜ፣ አስቸኳይ! ለሆስፒታል {amount} እፈልጋለሁ። ወደ {service} ቁጥር {phone} ይላኩ',
        'አጎት/አክስት፣ {service} የኔ ችግር አለበት። {amount} ለመቀበል ልትረዱኝ ትችላላችሁ? ቁጥር: {phone}',
        'ሰላም፣ ከቤተክርስቲያን ታስታውሰኛለህ? በ {amount} እገዛ እፈልጋለሁ። {service}: {phone}',
        'ዘመድ፣ ስልኬ ተበላሽቷል። ለመጠገን {amount} እፈልጋለሁ። {service} {phone} ላክ',
      ],
      prize_lottery: [
        'እንኳን ደስ አለዎት! ቁጥርዎ በ {service} ማስተዋወቂያ ውስጥ {amount} አሸንፏል። በ {url} ላይ ያገኙ',
        'እርስዎ የዛሬው አሸናፊ ነዎት! {service} {amount} ይሰጥዎታል። ለመቀበል {url} ይጫኑ',
        '{service} ማስተዋወቂያ: {amount} አሸንፈዋል! የማቀነባበሪያ ክፍያ {tax_amount} ወደ {phone} ይክፈሉ',
        'የአሸናፊ ማስጠንቀቂያ! የስልክ ቁጥርዎ ለ {amount} ተመርጧል። ያረጋግጡ: {url}',
      ],
    };
  }

  private getYorubaTemplates(): Record<ScamType, readonly string[]> {
    return {
      account_suspension: [
        'KÍLÓDÈ: Akọọlẹ {service} rẹ ti da duro nitori iṣe airotẹlẹ. Tẹ {url} lati jẹrisi laarin wakati 24',
        'ÌKÍLỌ̀: A rí ìwọlé airotẹlẹ sí akọọlẹ {service} rẹ. Jẹ́rìí ní {url} tàbí à ó dì í',
        'ÌGBESE PỌ̀NDANDAN: Akọọlẹ {service} rẹ yóò di ni wakati {hours}. Ṣe àtúnyẹ̀wò rẹ ní {url}',
      ],
      fake_credit: [
        'Ẹ kú oríire! O ti gba {amount} láti {service}. Tẹ {url} láti gba owó rẹ',
        'ÌFÌLỌ̀LẸ̀ OWÓ: {amount} ti wọlé sí apo {service} rẹ. Jẹ́rìí kí o lè yọ owó: {url}',
      ],
      otp_request: [
        '{service}: Jọ̀wọ́ jẹ́rìí kóòdù {otp} kí ìṣòwò lè parí. Bí kì í ṣe ìwọ, pe {phone}',
      ],
      customer_service: [
        'Ìbànisọ̀rọ̀ {service}: Akọọlẹ rẹ nílò ìmúdójúìwọ̀n. Pe wa lẹ́sẹ̀kẹsẹ̀ ní {phone}',
      ],
    };
  }

  private getIgboTemplates(): Record<ScamType, readonly string[]> {
    return {
      account_suspension: [
        "NGWA NGWA: Akaụntụ {service} gị akwụsịla n'ihi ọrụ na-adịghị mma. Pịa {url} iji kwenye n'ime awa 24",
      ],
      fake_credit: ['Ekele! Ị natala {amount} site na {service}. Pịa {url} ka ị nara ego gị'],
      otp_request: [
        '{service}: Biko kwenye koodu {otp} iji mechaa azụmahịa. Ọ bụrụ na ọ bụghị gị, kpọọ {phone}',
      ],
      customer_service: [
        'Nlekọta Ndị Ahịa {service}: Akaụntụ gị chọrọ mmelite. Kpọọ anyị ozugbo na {phone}',
      ],
    };
  }

  private getHausaTemplates(): Record<ScamType, readonly string[]> {
    return {
      account_suspension: [
        'GAGGAWA: An dakatar da asusun {service} ku saboda ayyukan da ba a sani ba. Danna {url} don tabbatarwa cikin awanni 24',
      ],
      fake_credit: [
        'Barka dai! Kun karɓi {amount} daga {service}. Danna {url} don karɓar kuɗin ku',
      ],
      otp_request: [
        "{service}: Da fatan za a tabbatar da lambar {otp} don kammala ma'amala. Idan ba kai ba ne, kira {phone}",
      ],
      customer_service: [
        'Kula da Abokan Ciniki {service}: Asusun ku yana buƙatar sabuntawa. Ku kira mu nan take a {phone}',
      ],
    };
  }

  private getSwahiliTemplates(): Record<ScamType, readonly string[]> {
    return {
      account_suspension: [
        'HARAKA: Akaunti yako ya {service} imesimamishwa kwa sababu ya shughuli za ajabu. Bonyeza {url} kuthibitisha ndani ya saa 24',
      ],
      fake_credit: ['Hongera! Umepokea {amount} kutoka {service}. Bonyeza {url} kudai pesa zako'],
      otp_request: [
        '{service}: Tafadhali thibitisha nambari {otp} kukamilisha muamala. Kama si wewe, piga {phone}',
      ],
      customer_service: [
        'Huduma kwa Wateja wa {service}: Akaunti yako inahitaji usasishaji. Tupigie mara moja kwenye {phone}',
      ],
    };
  }

  private getPidginTemplates(): Record<ScamType, readonly string[]> {
    return {
      account_suspension: [
        'URGENT: Dem don suspend your {service} account because of activity wey no normal. Click {url} make you verify am for 24 hours',
      ],
      fake_credit: [
        'Congrats! You don receive {amount} from {service}. Click {url} make you collect your money.',
      ],
      otp_request: [
        '{service}: Abeg confirm OTP {otp} make transaction complete. If no be you start am, call {phone}',
      ],
      customer_service: [
        '{service} Customer Care: Your account need update. Call us sharp sharp for {phone}',
      ],
    };
  }

  private generatePhoneNumber(country: Country): string {
    const prefixes = PHONE_PREFIXES[country];
    const prefix = randomChoice(prefixes);
    const length = ['nigeria', 'kenya', 'tanzania'].includes(country) ? 7 : 6;
    const digits = Array.from({ length }, () => randomInt(0, 9)).join('');
    return `${prefix}${digits}`;
  }

  private generateUrl(): string {
    const domains = ['bit.ly', 'tinyurl.com', 'cutt.ly', 'rb.gy'] as const;
    const slug = `${randomChoice('abcdefghijklmnopqrstuvwxyz'.split(''))}${randomInt(100, 999)}`;
    return `https://${randomChoice(domains)}/${slug}`;
  }

  private generateAmount(currency: Currency): string {
    const amounts: Record<Currency, readonly number[]> = {
      NGN: [5000, 10000, 20000, 50000, 100000],
      KES: [1000, 5000, 10000, 20000, 50000],
      XOF: [5000, 10000, 25000, 50000, 100000],
      EGP: [500, 1000, 2000, 5000, 10000],
      ETB: [1000, 2500, 5000, 10000, 20000],
    };
    const amount = randomChoice(amounts[currency]);
    if (currency === 'NGN') {
      return `₦${amount.toLocaleString('en-NG')}`;
    }
    return `${currency} ${amount.toLocaleString('en-US')}`;
  }

  private generateOtp(): string {
    const length = randomChoice([4, 6] as const);
    return Array.from({ length }, () => randomInt(0, 9)).join('');
  }

  private formatTemplate(template: string, language: Language): string {
    const { country, currency } = LANG_CONFIG[language];
    return template
      .replaceAll('{service}', randomChoice(SERVICES[language]))
      .replaceAll('{url}', this.generateUrl())
      .replaceAll('{phone}', this.generatePhoneNumber(country))
      .replaceAll('{amount}', this.generateAmount(currency))
      .replaceAll('{tax_amount}', this.generateAmount(currency))
      .replaceAll('{otp}', this.generateOtp())
      .replaceAll('{hours}', String(randomChoice([2, 4, 12, 24] as const)));
  }

  private getLegitimateTemplate(language: Language): string {
    const templates: Record<Language, string> = {
      english: 'You have received {amount} from {name}. Balance: {balance}. Ref: {ref}',
      french: 'Vous avez reçu {amount} de {name}. Solde: {balance}. Réf: {ref}',
      arabic: 'لقد استلمت {amount} من {name}. الرصيد: {balance}. المرجع: {ref}',
      amharic: 'ከ {name} {amount} ተቀብለዋል። ሚዛን: {balance}። ማጣቀሻ: {ref}',
      yoruba: 'O ti gba {amount} láti {name}. Ìyọkúrò: {balance}. Ìtọ́kasí: {ref}',
      igbo: 'Ị natala {amount} site na {name}. Ngụkọta: {balance}. Nkọwa: {ref}',
      hausa: "Kun karɓi {amount} daga {name}. Ma'auni: {balance}. Lamba: {ref}",
      swahili: 'Umepokea {amount} kutoka {name}. Salio: {balance}. Rejea: {ref}',
      pidgin: 'You don collect {amount} from {name}. Balance: {balance}. Ref: {ref}',
    };
    return templates[language] ?? templates.english;
  }

  private generateReference(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 10 }, () => alphabet[randomInt(0, alphabet.length - 1)]).join('');
  }

  private generateLegitimateMessage(language: Language): string {
    const { currency } = LANG_CONFIG[language];
    const template = this.getLegitimateTemplate(language);
    const amount = this.generateAmount(currency);
    const balance = this.generateAmount(currency);
    const name = randomChoice(LEGITIMATE_NAMES);
    const ref = this.generateReference();
    return template
      .replaceAll('{amount}', amount)
      .replaceAll('{balance}', balance)
      .replaceAll('{name}', name)
      .replaceAll('{ref}', ref);
  }

  private getScamTypes(language: Language): ScamType[] {
    return Object.keys(this.templates[language]);
  }

  generatePhishingMessage(language: Language, scamType: ScamType): string {
    const templateGroup = this.templates[language][scamType];
    const templates = templateGroup?.length
      ? templateGroup
      : Object.values(this.templates[language])[0];
    const template = randomChoice(templates);
    return this.formatTemplate(template, language);
  }

  generateDataset(language: Language, options: GenerateOptions = {}): DatasetRecord[] {
    const { numPhishing = 1000, numLegitimate = 300 } = options;
    const dataset: DatasetRecord[] = [];
    const scamTypes = this.getScamTypes(language);
    const baseCount = Math.floor(numPhishing / scamTypes.length);
    const remainder = numPhishing % scamTypes.length;

    scamTypes.forEach((scamType, index) => {
      const count = baseCount + (index < remainder ? 1 : 0);
      for (let i = 0; i < count; i += 1) {
        try {
          const message = this.generatePhishingMessage(language, scamType);
          dataset.push({
            message,
            label: 'phishing',
            language,
            scam_type: scamType,
            source: 'synthetic',
          });
        } catch (error) {
          console.warn(`Skipping phishing message for ${language}/${scamType}:`, error);
        }
      }
    });

    for (let i = 0; i < numLegitimate; i += 1) {
      try {
        const message = this.generateLegitimateMessage(language);
        dataset.push({
          message,
          label: 'legitimate',
          language,
          scam_type: 'none',
          source: 'synthetic',
        });
      } catch (error) {
        console.warn(`Skipping legitimate message for ${language}:`, error);
      }
    }

    return dataset;
  }

  async saveDataset(
    dataset: DatasetRecord[],
    filename: string,
    options: SaveOptions = {}
  ): Promise<void> {
    const { format = filename.endsWith('.json') ? 'json' : 'csv' } = options;
    const outputPath = join(process.cwd(), filename);
    await mkdir(dirname(outputPath), { recursive: true });

    if (format === 'json') {
      const payload = JSON.stringify(dataset, null, 2);
      await writeFile(outputPath, payload, 'utf-8');
      console.log(`Saved ${dataset.length} messages to ${filename}`);
      return;
    }

    if (!dataset.length) {
      await writeFile(outputPath, '', 'utf-8');
      console.log(`Saved 0 messages to ${filename}`);
      return;
    }

    const header = Object.keys(dataset[0]).join(',');
    const rows = dataset
      .map((record) =>
        Object.values(record)
          .map((value) => formatCsvValue(String(value)))
          .join(',')
      )
      .join('\n');

    await writeFile(outputPath, `${header}\n${rows}`, 'utf-8');
    console.log(`Saved ${dataset.length} messages to ${filename}`);
  }

  async generateAllLanguages(
    outputDir: string = DEFAULT_OUTPUT_DIR,
    options: GenerateOptions = {}
  ): Promise<void> {
    const languages: Language[] = [
      'english',
      'yoruba',
      'igbo',
      'hausa',
      'swahili',
      'pidgin',
      'french',
      'arabic',
      'amharic',
    ];

    await mkdir(join(process.cwd(), outputDir), { recursive: true });

    const combined: DatasetRecord[] = [];

    for (const language of languages) {
      console.log(`\n${'='.repeat(50)}\nProcessing ${language.toUpperCase()}\n${'='.repeat(50)}`);
      const dataset = this.generateDataset(language, options);
      combined.push(...dataset);

      await this.saveDataset(dataset, join(outputDir, `${language}_phishing_dataset.csv`), {
        format: 'csv',
      });
      await this.saveDataset(dataset, join(outputDir, `${language}_phishing_dataset.json`), {
        format: 'json',
      });
    }

    console.log(`\n${'='.repeat(50)}\nSaving combined dataset...\n${'='.repeat(50)}`);
    await this.saveDataset(combined, join(outputDir, 'all_languages_combined.csv'), {
      format: 'csv',
    });
    await this.saveDataset(combined, join(outputDir, 'all_languages_combined.json'), {
      format: 'json',
    });

    console.log(`\n${'='.repeat(50)}\nDATASET STATISTICS\n${'='.repeat(50)}`);
    console.log(`Total messages: ${combined.length}`);
    console.log('\nBy language:');
    const languagesCount = languages.map((language) => {
      const langData = combined.filter((item) => item.language === language);
      const phishing = langData.filter((item) => item.label === 'phishing').length;
      const legitimate = langData.filter((item) => item.label === 'legitimate').length;
      console.log(
        `  ${language.charAt(0).toUpperCase()}${language.slice(1)}: ${langData.length} (${phishing} phishing, ${legitimate} legitimate)`
      );
      return { language, count: langData.length };
    });

    const total = languagesCount.reduce((sum, item) => sum + item.count, 0);
    console.log(`\nFiles saved in '${outputDir}/' directory`);
    console.log(`Dataset grand total: ${total}`);
  }
}

async function runCli(): Promise<void> {
  const generator = new PhishingDatasetGenerator();
  const outputDir = process.argv[2] ?? DEFAULT_OUTPUT_DIR;
  await generator.generateAllLanguages(outputDir);
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? fileURLToPath(pathToFileURL(process.argv[1]).href) : null;

if (invokedPath && invokedPath === modulePath) {
  runCli().catch((error) => {
    console.error('Dataset generation failed:', error);
    process.exit(1);
  });
}
