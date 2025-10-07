"""
Synthetic Phishing Dataset Generator for African Languages
Generates 1000+ realistic phishing messages per language
Languages: English, Yoruba, Igbo, Hausa, Swahili, Pidgin, French, Arabic, Amharic
"""

import json
import random
import csv
from datetime import datetime, timedelta
import os


class PhishingDatasetGenerator:
    def __init__(self):
        # Mobile Money Services by region
        self.services = {
            "english": [
                "MTN Mobile Money",
                "Airtel Money",
                "M-Pesa",
                "First Bank",
                "GTBank",
                "Access Bank",
                "UBA",
            ],
            "yoruba": [
                "MTN Mobile Money",
                "Airtel Money",
                "M-Pesa",
                "Ile-iṣowo First Bank",
                "GTBank",
                "Access Bank",
            ],
            "igbo": [
                "MTN Mobile Money",
                "Airtel Money",
                "M-Pesa",
                "First Bank",
                "GTBank",
                "Ụlọ akụ Access",
            ],
            "hausa": [
                "MTN Mobile Money",
                "Airtel Money",
                "M-Pesa",
                "Bankin First",
                "GTBank",
                "Access Bank",
            ],
            "swahili": [
                "M-Pesa",
                "Airtel Money",
                "Tigo Pesa",
                "Vodacom M-Pesa",
                "Benki ya Kenya",
            ],
            "pidgin": [
                "MTN Mobile Money",
                "Airtel Money",
                "M-Pesa",
                "First Bank",
                "GTBank",
                "Access Bank",
            ],
            "french": [
                "MTN Mobile Money",
                "Orange Money",
                "Moov Money",
                "Wave",
                "Banque Atlantique",
                "Ecobank",
            ],
            "arabic": [
                "فودافون كاش",
                "أورنج موني",
                "MTN Mobile Money",
                "بنك مصر",
                "البنك الأهلي",
            ],
            "amharic": ["M-BIRR", "HelloCash", "CBE Birr", "አምሃራ ባንክ", "ንግድ ባንክ"],
        }

        # Phone number patterns by region
        self.phone_patterns = {
            "nigeria": ["+234", "0"],
            "kenya": ["+254", "0"],
            "tanzania": ["+255", "0"],
            "senegal": ["+221", "0"],
            "ivorycoast": ["+225", "0"],
            "egypt": ["+20", "0"],
            "ethiopia": ["+251", "0"],
        }

        # Scam patterns per language
        self.templates = self.initialize_templates()

    def initialize_templates(self):
        """Initialize phishing message templates for each language"""
        templates = {
            "english": self._get_english_templates(),
            "yoruba": self._get_yoruba_templates(),
            "igbo": self._get_igbo_templates(),
            "hausa": self._get_hausa_templates(),
            "swahili": self._get_swahili_templates(),
            "pidgin": self._get_pidgin_templates(),
            "french": self._get_french_templates(),
            "arabic": self._get_arabic_templates(),
            "amharic": self._get_amharic_templates(),
        }
        return templates

    def _get_english_templates(self):
        """English phishing templates"""
        return {
            "account_suspension": [
                "URGENT: Your {service} account has been suspended due to unusual activity. Click {url} to verify within 24hrs or lose access permanently.",
                "ALERT: We detected suspicious login to your {service} account. Verify now at {url} or your account will be blocked.",
                "ACTION REQUIRED: Your {service} account will be deactivated in {hours} hours. Update your details at {url}",
                "{service} SECURITY: Unusual transaction detected. Confirm your identity at {url} immediately.",
                "FINAL WARNING: Your {service} account suspended. Restore access: {url}. Reply with PIN if link fails.",
            ],
            "fake_credit": [
                "Congratulations! You have received {amount} from {service}. Click {url} to claim your funds.",
                "CREDIT ALERT: {amount} credited to your {service} wallet. Verify to withdraw: {url}",
                "{service}: You won {amount} in our customer loyalty promo! Claim at {url}",
                "You've received {amount} from unknown sender. Check transaction at {url}",
                "PROMO ALERT: {service} is giving {amount} to random users. You're selected! Claim: {url}",
            ],
            "otp_request": [
                "{service}: Please confirm OTP {otp} to complete transaction. If not initiated by you, call {phone}",
                "Your {service} verification code is {otp}. Share this with our agent at {phone} to verify account",
                "SECURITY CODE: {otp}. {service} customer care needs this to resolve your issue. Call {phone}",
                "{service} sent you verification code {otp}. Reply with this code to activate your account",
                "OTP: {otp}. Your {service} account requires verification. Contact support {phone} with this code",
            ],
            "customer_service": [
                "{service} Customer Care: Your account needs update. Call us immediately at {phone}",
                "This is {service} support team. We noticed issues with your account. Reach us on {phone}",
                "URGENT: {service} detected fraud on your account. Contact {phone} NOW to secure your funds",
                "{service} ALERT: System upgrade requires verification. Call {phone} within 2 hours",
                "Your {service} PIN has expired. Call {phone} to reset or visit {url}",
            ],
        }

    def _get_french_templates(self):
        """French phishing templates"""
        return {
            "account_suspension": [
                "URGENT: Votre compte {service} a été suspendu en raison d'activités inhabituelles. Cliquez sur {url} pour vérifier dans les 24h.",
                "ALERTE: Nous avons détecté une connexion suspecte à votre compte {service}. Vérifiez maintenant sur {url}",
                "ACTION REQUISE: Votre compte {service} sera désactivé dans {hours} heures. Mettez à jour vos informations sur {url}",
                "{service} SÉCURITÉ: Transaction inhabituelle détectée. Confirmez votre identité sur {url} immédiatement.",
                "DERNIER AVERTISSEMENT: Compte {service} suspendu. Restaurez l'accès: {url}. Répondez avec votre PIN si le lien ne fonctionne pas.",
            ],
            "fake_credit": [
                "Félicitations! Vous avez reçu {amount} de {service}. Cliquez sur {url} pour réclamer vos fonds.",
                "ALERTE CRÉDIT: {amount} crédité sur votre portefeuille {service}. Vérifiez pour retirer: {url}",
                "{service}: Vous avez gagné {amount} dans notre promo de fidélité! Réclamez sur {url}",
                "Vous avez reçu {amount} d'un expéditeur inconnu. Vérifiez la transaction sur {url}",
                "ALERTE PROMO: {service} offre {amount} aux utilisateurs sélectionnés. Vous êtes choisi! Réclamez: {url}",
            ],
            "otp_request": [
                "{service}: Veuillez confirmer le code OTP {otp} pour compléter la transaction. Si ce n'est pas vous, appelez {phone}",
                "Votre code de vérification {service} est {otp}. Partagez-le avec notre agent au {phone}",
                "CODE SÉCURITÉ: {otp}. Le service client {service} en a besoin. Appelez {phone}",
                "{service} vous a envoyé le code {otp}. Répondez avec ce code pour activer votre compte",
                "OTP: {otp}. Votre compte {service} nécessite une vérification. Contactez le support {phone}",
            ],
            "customer_service": [
                "Service Client {service}: Votre compte nécessite une mise à jour. Appelez-nous immédiatement au {phone}",
                "C'est l'équipe de support {service}. Nous avons remarqué des problèmes avec votre compte. Contactez-nous au {phone}",
                "URGENT: {service} a détecté une fraude sur votre compte. Contactez {phone} MAINTENANT pour sécuriser vos fonds",
                "ALERTE {service}: La mise à niveau du système nécessite une vérification. Appelez {phone} dans les 2 heures",
                "Votre PIN {service} a expiré. Appelez {phone} pour réinitialiser ou visitez {url}",
            ],
            "help_scam": [
                "Bonjour, c'est Fatou. Je suis bloquée et j'ai besoin de {amount} d'urgence. Envoyez à {phone} SVP. Je rembourse demain!",
                "Frère, urgence! J'ai besoin de {amount} pour l'hôpital. Envoyez au numéro {service} {phone}",
                "Oncle/Tante, mon {service} a un problème. Pouvez-vous m'aider à recevoir {amount}? Numéro: {phone}",
                "Salut, tu te souviens de moi de l'église? J'ai besoin d'aide avec {amount}. {service}: {phone}",
                "Cousin, mon téléphone est cassé. J'ai besoin de {amount} pour réparer. Envoie {service} {phone}",
            ],
            "prize_lottery": [
                "FÉLICITATIONS! Votre numéro a gagné {amount} dans la promo {service}. Réclamez sur {url}",
                "Vous êtes le gagnant du jour! {service} vous offre {amount}. Cliquez sur {url}",
                "{service} PROMO: Vous avez gagné {amount}! Payez {tax_amount} de frais de traitement à {phone}",
                "ALERTE GAGNANT! Votre numéro a été sélectionné pour {amount}. Vérifiez: {url}",
            ],
        }

    def _get_arabic_templates(self):
        """Arabic phishing templates"""
        return {
            "account_suspension": [
                "عاجل: تم تعليق حساب {service} الخاص بك بسبب نشاط غير عادي. انقر {url} للتحقق خلال 24 ساعة",
                "تنبيه: اكتشفنا دخول مشبوه إلى حساب {service} الخاص بك. تحقق الآن على {url}",
                "إجراء مطلوب: سيتم تعطيل حساب {service} الخاص بك في غضون {hours} ساعات. حدّث بياناتك على {url}",
                "{service} الأمان: تم اكتشاف معاملة غير عادية. أكد هويتك على {url} فوراً",
                "تحذير أخير: تم تعليق حساب {service}. استعد الوصول: {url}. رد برقم PIN إذا فشل الرابط",
            ],
            "fake_credit": [
                "تهانينا! لقد استلمت {amount} من {service}. انقر {url} للمطالبة بأموالك",
                "تنبيه رصيد: تم إضافة {amount} إلى محفظة {service} الخاصة بك. تحقق للسحب: {url}",
                "{service}: لقد فزت بـ {amount} في عرض ولاء العملاء! طالب به على {url}",
                "لقد استلمت {amount} من مرسل غير معروف. تحقق من المعاملة على {url}",
                "تنبيه عرض: {service} يقدم {amount} لمستخدمين عشوائيين. تم اختيارك! طالب به: {url}",
            ],
            "otp_request": [
                "{service}: يرجى تأكيد رمز OTP {otp} لإكمال المعاملة. إذا لم تكن أنت، اتصل بـ {phone}",
                "رمز التحقق من {service} الخاص بك هو {otp}. شاركه مع وكيلنا على {phone}",
                "رمز الأمان: {otp}. خدمة عملاء {service} بحاجة إليه. اتصل بـ {phone}",
                "{service} أرسل لك رمز التحقق {otp}. رد بهذا الرمز لتفعيل حسابك",
                "OTP: {otp}. حساب {service} الخاص بك يتطلب التحقق. اتصل بالدعم {phone}",
            ],
            "customer_service": [
                "خدمة عملاء {service}: حسابك يحتاج إلى تحديث. اتصل بنا فوراً على {phone}",
                "هذا فريق دعم {service}. لاحظنا مشاكل في حسابك. اتصل بنا على {phone}",
                "عاجل: {service} اكتشف احتيالاً على حسابك. اتصل بـ {phone} الآن لتأمين أموالك",
                "تنبيه {service}: ترقية النظام تتطلب التحقق. اتصل بـ {phone} خلال ساعتين",
                "انتهت صلاحية رقم PIN الخاص بـ {service}. اتصل بـ {phone} لإعادة التعيين أو قم بزيارة {url}",
            ],
            "help_scam": [
                "مرحباً، أنا فاطمة. أنا عالقة وأحتاج {amount} بشكل عاجل. أرسل إلى {phone} من فضلك. سأرد غداً!",
                "أخي، حالة طارئة! أحتاج {amount} للمستشفى. أرسل إلى رقم {service} {phone}",
                "عمي/عمتي، {service} الخاص بي به مشكلة. هل يمكنك مساعدتي في استلام {amount}؟ الرقم: {phone}",
                "مرحباً، هل تتذكرني من المسجد؟ أحتاج مساعدة بـ {amount}. {service}: {phone}",
                "ابن عم، هاتفي معطل. أحتاج {amount} للإصلاح. أرسل {service} {phone}",
            ],
            "prize_lottery": [
                "تهانينا! رقمك فاز بـ {amount} في عرض {service}. طالب به على {url}",
                "أنت الفائز اليوم! {service} يقدم لك {amount}. انقر {url} للاستلام",
                "{service} عرض: لقد فزت بـ {amount}! ادفع {tax_amount} رسوم معالجة إلى {phone}",
                "تنبيه فائز! تم اختيار رقم هاتفك لـ {amount}. تحقق: {url}",
            ],
        }

    def _get_amharic_templates(self):
        """Amharic phishing templates"""
        return {
            "account_suspension": [
                "አስቸኳይ: የእርስዎ {service} መለያ ባልተለመደ እንቅስቃሴ ምክንያት ታግዷል። በ24 ሰዓት ውስጥ ለማረጋገጥ {url} ይጫኑ",
                "ማስጠንቀቂያ: በእርስዎ {service} መለያ ላይ አጠራጣሪ መግባት አግኝተናል። አሁኑኑ በ {url} ላይ ያረጋግጡ",
                "እርምጃ ያስፈልጋል: የእርስዎ {service} መለያ በ {hours} ሰዓት ውስጥ ይዘጋል። መረጃዎን በ {url} ያዘምኑ",
                "{service} ደህንነት: ያልተለመደ ግብይት ተገኝቷል። መታወቂያዎን በ {url} ላይ ወዲያውኑ ያረጋግጡ",
                "የመጨረሻ ማስጠንቀቂያ: {service} መለያ ታግዷል። መዳረሻን መልስ: {url}። አገናኙ ካልሰራ በPIN ይመልሱ",
            ],
            "fake_credit": [
                "እንኳን ደስ አለዎት! ከ {service} {amount} ተቀብለዋል። ገንዘብዎን ለማግኘት {url} ይጫኑ",
                "የክሬዲት ማስጠንቀቂያ: {amount} ወደ {service} ቦርሳዎ ገብቷል። ለማውጣት ያረጋግጡ: {url}",
                "{service}: በደንበኛ ታማኝነት ማስተዋወቂያችን ውስጥ {amount} አሸንፈዋል! በ {url} ላይ ያገኙ",
                "ከማያውቋቸው ላኪ {amount} ተቀብለዋል። ግብይቱን በ {url} ላይ ይመልከቱ",
                "የማስተዋወቂያ ማስጠንቀቂያ: {service} ለዘፈቀደ ተጠቃሚዎች {amount} እየሰጠ ነው። ተመርጠዋል! ያገኙ: {url}",
            ],
            "otp_request": [
                "{service}: ግብይቱን ለማጠናቀቅ እባክዎ OTP {otp} ያረጋግጡ። እርስዎ ካልሆነ {phone} ይደውሉ",
                "የእርስዎ {service} የማረጋገጫ ኮድ {otp} ነው። ይህንን ከወኪላችን ጋር በ {phone} ላይ ያጋሩ",
                "የደህንነት ኮድ: {otp}። {service} የደንበኞች እንክብካቤ ይህን ያስፈልጋል። {phone} ይደውሉ",
                "{service} የማረጋገጫ ኮድ {otp} ላከልዎ። መለያዎን ለማግበር በዚህ ኮድ ይመልሱ",
                "OTP: {otp}። የእርስዎ {service} መለያ ማረጋገጫ ያስፈልጋል። ድጋፍን {phone} ያነጋግሩ",
            ],
            "customer_service": [
                "{service} የደንበኞች እንክብካቤ: መለያዎ ማዘመን ያስፈልጋል። ወዲያውኑ በ {phone} ላይ ይደውሉልን",
                "ይህ {service} ድጋፍ ቡድን ነው። በመለያዎ ላይ ችግሮችን አስተውለናል። በ {phone} ላይ ያግኙን",
                "አስቸኳይ: {service} በመለያዎ ላይ ማጭበርበር አግኝቷል። ገንዘብዎን ለመጠበቅ አሁን {phone} ይደውሉ",
                "{service} ማስጠንቀቂያ: የስርዓት ማሻሻያ ማረጋገጫ ያስፈልጋል። በ2 ሰዓት ውስጥ {phone} ይደውሉ",
                "የእርስዎ {service} PIN ጊዜው አልፎበታል። ለመቀየር {phone} ይደውሉ ወይም {url} ይጎብኙ",
            ],
            "help_scam": [
                "ሰላም፣ እኔ አለማየሁ ነኝ። ተጣብቄ ነው እና በአስቸኳይ {amount} እፈልጋለሁ። እባክዎን ወደ {phone} ይላኩ። ነገ እመልሳለሁ!",
                "ወንድሜ፣ አስቸኳይ! ለሆስፒታል {amount} እፈልጋለሁ። ወደ {service} ቁጥር {phone} ይላኩ",
                "አጎት/አክስት፣ {service} የኔ ችግር አለበት። {amount} ለመቀበል ልትረዱኝ ትችላላችሁ? ቁጥር: {phone}",
                "ሰላም፣ ከቤተክርስቲያን ታስታውሰኛለህ? በ {amount} እገዛ እፈልጋለሁ። {service}: {phone}",
                "ዘመድ፣ ስልኬ ተበላሽቷል። ለመጠገን {amount} እፈልጋለሁ። {service} {phone} ላክ",
            ],
            "prize_lottery": [
                "እንኳን ደስ አለዎት! ቁጥርዎ በ {service} ማስተዋወቂያ ውስጥ {amount} አሸንፏል። በ {url} ላይ ያገኙ",
                "እርስዎ የዛሬው አሸናፊ ነዎት! {service} {amount} ይሰጥዎታል። ለመቀበል {url} ይጫኑ",
                "{service} ማስተዋወቂያ: {amount} አሸንፈዋል! የማቀነባበሪያ ክፍያ {tax_amount} ወደ {phone} ይክፈሉ",
                "የአሸናፊ ማስጠንቀቂያ! የስልክ ቁጥርዎ ለ {amount} ተመርጧል። ያረጋግጡ: {url}",
            ],
        }

    def _get_yoruba_templates(self):
        """Yoruba templates (already defined in original)"""
        return {
            "account_suspension": [
                "KILODE: Akọọlẹ {service} rẹ ti da duro nitori iṣe airotẹlẹ. Tẹ {url} lati jẹrisi laarin wakati 24",
                "IKILỌ: A rii wiwọle airotẹlẹ si akọọlẹ {service} rẹ. Jẹrisi ni {url} tabi a o di i",
                "O PỌNDANDAN: Akọọlẹ {service} rẹ yoo di duro ni wakati {hours}. Ṣe imudojuiwọn ni {url}",
            ],
            "fake_credit": [
                "Eku oriire! O ti gba {amount} lati {service}. Tẹ {url} lati gba owo rẹ",
                "IFILỌLẸ OWO: {amount} ti wọle si apo {service} rẹ. Jẹrisi lati yọ: {url}",
            ],
            "otp_request": [
                "{service}: Jọwọ jẹrisi koodu {otp} lati pari iṣowo. Ti kii ṣe iwọ, pe {phone}",
            ],
            "customer_service": [
                "Ile-iṣẹ {service}: Akọọlẹ rẹ nilo imudojuiwọn. Pe wa lẹsẹkẹsẹ ni {phone}",
            ],
        }

    def _get_igbo_templates(self):
        """Igbo templates"""
        return {
            "account_suspension": [
                "NGWA NGWA: Akaụntụ {service} gị akwụsịla n'ihi ọrụ na-adịghị mma. Pịa {url} iji kwenye n'ime awa 24",
            ],
            "fake_credit": [
                "Ekele! Ị natala {amount} site na {service}. Pịa {url} ka ị nara ego gị",
            ],
            "otp_request": [
                "{service}: Biko kwenye koodu {otp} iji mechaa azụmahịa. Ọ bụrụ na ọ bụghị gị, kpọọ {phone}",
            ],
            "customer_service": [
                "Nlekọta Ndị Ahịa {service}: Akaụntụ gị chọrọ mmelite. Kpọọ anyị ozugbo na {phone}",
            ],
        }

    def _get_hausa_templates(self):
        """Hausa templates"""
        return {
            "account_suspension": [
                "GAGGAWA: An dakatar da asusun {service} ku saboda ayyukan da ba a sani ba. Danna {url} don tabbatarwa cikin awanni 24",
            ],
            "fake_credit": [
                "Barka dai! Kun karbi {amount} daga {service}. Danna {url} don karbar kuɗin ku",
            ],
            "otp_request": [
                "{service}: Da fatan za a tabbatar da lambar {otp} don kammala ma'amala. Idan ba kai ba ne, kira {phone}",
            ],
            "customer_service": [
                "Kula da Abokan Ciniki {service}: Asusun ku yana buƙatar sabuntawa. Ku kira mu nan take a {phone}",
            ],
        }

    def _get_swahili_templates(self):
        """Swahili templates"""
        return {
            "account_suspension": [
                "HARAKA: Akaunti yako ya {service} imesimamishwa kwa sababu ya shughuli za ajabu. Bonyeza {url} kuthibitisha ndani ya saa 24",
            ],
            "fake_credit": [
                "Hongera! Umepokea {amount} kutoka {service}. Bonyeza {url} kudai pesa zako",
            ],
            "otp_request": [
                "{service}: Tafadhali thibitisha nambari {otp} kukamilisha muamala. Kama si wewe, piga {phone}",
            ],
            "customer_service": [
                "Huduma kwa Wateja wa {service}: Akaunti yako inahitaji usasishaji. Tupigie mara moja kwenye {phone}",
            ],
        }

    def _get_pidgin_templates(self):
        """Pidgin templates"""
        return {
            "account_suspension": [
                "URGENT: Dem don suspend your {service} account because of activity wey no normal. Click {url} make you verify am for 24 hours",
            ],
            "fake_credit": [
                "Congrats! You don receive {amount} from {service}. Click {url} make you collect your money.",
            ],
            "otp_request": [
                "{service}: Abeg confirm OTP {otp} make transaction complete. If no be you start am, call {phone}",
            ],
            "customer_service": [
                "{service} Customer Care: Your account need update. Call us sharp sharp for {phone}",
            ],
        }

    def generate_phone_number(self, country="nigeria"):
        """Generate realistic phone numbers"""
        patterns = {
            "nigeria": ["0803", "0806", "0810", "0813", "0816", "0703"],
            "kenya": ["0701", "0702", "0710", "0720"],
            "tanzania": ["0714", "0715", "0754", "0755"],
            "senegal": ["77", "78", "76", "70"],
            "ivorycoast": ["07", "05", "01"],
            "egypt": ["010", "011", "012", "015"],
            "ethiopia": ["091", "092", "093", "094"],
        }
        prefix = random.choice(patterns.get(country, patterns["nigeria"]))
        length = 7 if country in ["nigeria", "kenya", "tanzania"] else 6
        return prefix + "".join([str(random.randint(0, 9)) for _ in range(length)])

    def generate_url(self):
        """Generate realistic phishing URLs"""
        domains = ["bit.ly", "tinyurl.com", "cutt.ly", "rb.gy"]
        return f"https://{random.choice(domains)}/{random.choice('abcdefghijklmnopqrstuvwxyz')}{random.randint(100, 999)}"

    def generate_amount(self, currency="NGN"):
        """Generate realistic transaction amounts"""
        amounts = {
            "NGN": [5000, 10000, 20000, 50000, 100000],
            "KES": [1000, 5000, 10000, 20000, 50000],
            "XOF": [5000, 10000, 25000, 50000, 100000],
            "EGP": [500, 1000, 2000, 5000, 10000],
            "ETB": [1000, 2500, 5000, 10000, 20000],
        }
        amount = random.choice(amounts.get(currency, amounts["NGN"]))
        return f"{currency} {amount:,}" if currency != "NGN" else f"₦{amount:,}"

    def generate_otp(self):
        """Generate OTP codes"""
        return "".join(
            [str(random.randint(0, 9)) for _ in range(random.choice([4, 6]))]
        )

    def generate_phishing_message(self, language, scam_type):
        """Generate a single phishing message"""
        templates = self.templates[language].get(scam_type, [])
        if not templates:
            templates = list(self.templates[language].values())[0]

        template = random.choice(templates)

        # Determine country and currency based on language
        lang_config = {
            "yoruba": ("nigeria", "NGN"),
            "igbo": ("nigeria", "NGN"),
            "hausa": ("nigeria", "NGN"),
            "pidgin": ("nigeria", "NGN"),
            "swahili": ("kenya", "KES"),
            "french": ("senegal", "XOF"),
            "arabic": ("egypt", "EGP"),
            "amharic": ("ethiopia", "ETB"),
            "english": ("nigeria", "NGN"),
        }
        country, currency = lang_config.get(language, ("nigeria", "NGN"))

        message = template.format(
            service=random.choice(self.services[language]),
            url=self.generate_url(),
            phone=self.generate_phone_number(country),
            amount=self.generate_amount(currency),
            tax_amount=self.generate_amount(currency),
            otp=self.generate_otp(),
            hours=random.choice([2, 4, 12, 24]),
        )
        return message

    def generate_legitimate_message(self, language):
        """Generate legitimate mobile money messages"""
        templates = {
            "english": "You have received {amount} from {name}. Balance: {balance}. Ref: {ref}",
            "french": "Vous avez reçu {amount} de {name}. Solde: {balance}. Réf: {ref}",
            "arabic": "لقد استلمت {amount} من {name}. الرصيد: {balance}. المرجع: {ref}",
            "amharic": "ከ {name} {amount} ተቀብለዋል። ሚዛን: {balance}። ማጣቀሻ: {ref}",
            "yoruba": "O ti gba {amount} lati {name}. Iye owo: {balance}. Ref: {ref}",
            "igbo": "Ị natala {amount} site na {name}. Ngụkọta: {balance}. Ref: {ref}",
            "hausa": "Kun karbi {amount} daga {name}. Ma'auni: {balance}. Ref: {ref}",
            "swahili": "Umepokea {amount} kutoka {name}. Salio: {balance}. Ref: {ref}",
            "pidgin": "You don receive {amount} from {name}. Balance: {balance}. Ref: {ref}",
        }

        lang_config = {
            "french": ("senegal", "XOF"),
            "arabic": ("egypt", "EGP"),
            "amharic": ("ethiopia", "ETB"),
            "swahili": ("kenya", "KES"),
        }
        country, currency = lang_config.get(language, ("nigeria", "NGN"))

        template = templates.get(language, templates["english"])
        names = ["John Doe", "Jane Smith", "DSTV", "EKEDC"]

        return template.format(
            name=random.choice(names),
            amount=self.generate_amount(currency),
            balance=self.generate_amount(currency),
            ref="".join(
                [
                    random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
                    for _ in range(10)
                ]
            ),
        )

    def generate_dataset(self, language, num_phishing=1000, num_legitimate=300):
        """Generate complete dataset for a language"""
        dataset = []
        scam_types = list(self.templates[language].keys())
        messages_per_type = num_phishing // len(scam_types)

        print(f"Generating {num_phishing} phishing messages in {language}...")
        for scam_type in scam_types:
            for _ in range(messages_per_type):
                try:
                    message = self.generate_phishing_message(language, scam_type)
                    dataset.append(
                        {
                            "message": message,
                            "label": "phishing",
                            "language": language,
                            "scam_type": scam_type,
                            "source": "synthetic",
                        }
                    )
                except Exception as e:
                    continue

        print(f"Generating {num_legitimate} legitimate messages in {language}...")
        for _ in range(num_legitimate):
            try:
                message = self.generate_legitimate_message(language)
                dataset.append(
                    {
                        "message": message,
                        "label": "legitimate",
                        "language": language,
                        "scam_type": "none",
                        "source": "synthetic",
                    }
                )
            except Exception as e:
                continue

        return dataset

    def save_dataset(self, dataset, filename, format="csv"):
        """Save dataset to file"""
        if format == "csv":
            with open(filename, "w", newline="", encoding="utf-8") as f:
                if dataset:
                    writer = csv.DictWriter(f, fieldnames=dataset[0].keys())
                    writer.writeheader()
                    writer.writerows(dataset)
        elif format == "json":
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(dataset, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(dataset)} messages to {filename}")

    def generate_all_languages(self, output_dir="phishing_dataset"):
        """Generate datasets for all languages"""
        os.makedirs(output_dir, exist_ok=True)
        languages = [
            "english",
            "yoruba",
            "igbo",
            "hausa",
            "swahili",
            "pidgin",
            "french",
            "arabic",
            "amharic",
        ]
        all_data = []

        for language in languages:
            print(f"\n{'='*50}\nProcessing {language.upper()}\n{'='*50}")
            dataset = self.generate_dataset(
                language, num_phishing=1000, num_legitimate=300
            )
            all_data.extend(dataset)
            self.save_dataset(
                dataset, f"{output_dir}/{language}_phishing_dataset.csv", format="csv"
            )
            self.save_dataset(
                dataset, f"{output_dir}/{language}_phishing_dataset.json", format="json"
            )

        print(f"\n{'='*50}\nSaving combined dataset...\n{'='*50}")
        self.save_dataset(
            all_data, f"{output_dir}/all_languages_combined.csv", format="csv"
        )
        self.save_dataset(
            all_data, f"{output_dir}/all_languages_combined.json", format="json"
        )

        print(f"\n{'='*50}\nDATASET STATISTICS\n{'='*50}")
        print(f"Total messages: {len(all_data)}")
        print(f"\nBy language:")
        for lang in languages:
            lang_data = [d for d in all_data if d["language"] == lang]
            phish = len([d for d in lang_data if d["label"] == "phishing"])
            legit = len([d for d in lang_data if d["label"] == "legitimate"])
            print(
                f"  {lang.capitalize()}: {len(lang_data)} ({phish} phishing, {legit} legitimate)"
            )
        print(f"\nFiles saved in '{output_dir}/' directory")


if __name__ == "__main__":
    print(
        "=" * 70
        + "\nMULTILINGUAL PHISHING DATASET GENERATOR\n9 Languages: English, Yoruba, Igbo, Hausa, Swahili, Pidgin, French, Arabic, Amharic\n"
        + "=" * 70
        + "\n"
    )
    generator = PhishingDatasetGenerator()
    generator.generate_all_languages(output_dir="phishing_dataset")
    print(
        "\n"
        + "=" * 70
        + "\nGENERATION COMPLETE!\n"
        + "=" * 70
        + "\nDataset ready for model training 🚀"
    )
