"""
Synthetic Phishing Dataset Generator for African Languages
Generates 1000+ realistic phishing messages per language
Languages: English, Yoruba, Igbo, Hausa, Swahili
"""

import json
import random
import csv
from datetime import datetime, timedelta
import os

class PhishingDatasetGenerator:
    def __init__(self):
        # Mobile Money Services
        self.services = {
            'english': ['MTN Mobile Money', 'Airtel Money', 'M-Pesa', 'First Bank', 'GTBank', 'Access Bank', 'UBA'],
            'yoruba': ['MTN Mobile Money', 'Airtel Money', 'M-Pesa', 'Ile-iṣowo First Bank', 'GTBank', 'Access Bank'],
            'igbo': ['MTN Mobile Money', 'Airtel Money', 'M-Pesa', 'First Bank', 'GTBank', 'Ụlọ akụ Access'],
            'hausa': ['MTN Mobile Money', 'Airtel Money', 'M-Pesa', 'Bankin First', 'GTBank', 'Access Bank'],
            'swahili': ['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Vodacom M-Pesa', 'Benki ya Kenya']
        }
        
        # Phone number patterns
        self.phone_patterns = {
            'nigeria': ['+234', '0'],
            'kenya': ['+254', '0'],
            'tanzania': ['+255', '0']
        }
        
        # Scam patterns per language
        self.templates = self.initialize_templates()
    
    def initialize_templates(self):
        """Initialize phishing message templates for each language"""
        return {
            'english': {
                'account_suspension': [
                    "URGENT: Your {service} account has been suspended due to unusual activity. Click {url} to verify within 24hrs or lose access permanently.",
                    "ALERT: We detected suspicious login to your {service} account. Verify now at {url} or your account will be blocked.",
                    "ACTION REQUIRED: Your {service} account will be deactivated in {hours} hours. Update your details at {url}",
                    "{service} SECURITY: Unusual transaction detected. Confirm your identity at {url} immediately.",
                    "FINAL WARNING: Your {service} account suspended. Restore access: {url}. Reply with PIN if link fails.",
                ],
                'fake_credit': [
                    "Congratulations! You have received {amount} from {service}. Click {url} to claim your funds.",
                    "CREDIT ALERT: {amount} credited to your {service} wallet. Verify to withdraw: {url}",
                    "{service}: You won {amount} in our customer loyalty promo! Claim at {url}",
                    "You've received {amount} from unknown sender. Check transaction at {url}",
                    "PROMO ALERT: {service} is giving {amount} to random users. You're selected! Claim: {url}",
                ],
                'otp_request': [
                    "{service}: Please confirm OTP {otp} to complete transaction. If not initiated by you, call {phone}",
                    "Your {service} verification code is {otp}. Share this with our agent at {phone} to verify account",
                    "SECURITY CODE: {otp}. {service} customer care needs this to resolve your issue. Call {phone}",
                    "{service} sent you verification code {otp}. Reply with this code to activate your account",
                    "OTP: {otp}. Your {service} account requires verification. Contact support {phone} with this code",
                ],
                'customer_service': [
                    "{service} Customer Care: Your account needs update. Call us immediately at {phone}",
                    "This is {service} support team. We noticed issues with your account. Reach us on {phone}",
                    "URGENT: {service} detected fraud on your account. Contact {phone} NOW to secure your funds",
                    "{service} ALERT: System upgrade requires verification. Call {phone} within 2 hours",
                    "Your {service} PIN has expired. Call {phone} to reset or visit {url}",
                ],
                'help_scam': [
                    "Hello, this is Amaka. I'm stranded and need {amount} urgently. Please send to {phone}. Will refund tomorrow!",
                    "Brother, emergency! Need {amount} for hospital. Send to this {service} number {phone}. God bless",
                    "Uncle/Aunty, my {service} is having issues. Can you help receive {amount} and send cash? Number: {phone}",
                    "Hi, remember me from church? I need help with {amount} urgently. {service}: {phone}. Thanks!",
                    "Cousin, phone spoilt. Need {amount} for repair to call mum. Send {service} {phone}. Will pay back",
                ],
                'sim_swap': [
                    "{service} SECURITY: We detected SIM swap attempt on your line. Call {phone} to block",
                    "ALERT: Someone tried to swap your SIM. Verify your identity at {url} now",
                    "WARNING: Unauthorized SIM change detected. Your {service} will be blocked. Call {phone}",
                    "{service}: SIM swap in progress. Stop it by replying STOP {otp} or call {phone}",
                    "URGENT: Confirm SIM swap request. If not you, call {service} at {phone} immediately",
                ],
                'prize_lottery': [
                    "CONGRATULATIONS! Your number won {amount} in {service} promo. Claim at {url}",
                    "You are today's lucky winner! {service} is giving you {amount}. Click {url} to receive",
                    "{service} PROMO: You won {amount}! Pay {tax_amount} processing fee to {phone} to claim",
                    "WINNER ALERT! Your phone number selected for {amount} cash prize. Verify: {url}",
                    "Lucky draw: You won {amount} from {service}. Send ID to {phone} to process payment",
                ],
                'tax_fee': [
                    "Your {service} transaction of {amount} requires {tax_amount} tax clearance. Pay to {phone}",
                    "CUSTOMS ALERT: {amount} package awaiting delivery. Pay {tax_amount} clearance to {phone}",
                    "{service}: To receive {amount}, pay {tax_amount} processing fee first to {phone}",
                    "Your funds {amount} are ready. Government tax {tax_amount} must be paid to {phone}",
                    "CLAIM NOTICE: {amount} waiting. Transfer {tax_amount} activation fee to {url}",
                ],
            },
            
            'yoruba': {
                'account_suspension': [
                    "KILODE: Akọọlẹ {service} rẹ ti da duro nitori iṣe airotẹlẹ. Tẹ {url} lati jẹrisi laarin wakati 24",
                    "IKILỌ: A rii wiwọle airotẹlẹ si akọọlẹ {service} rẹ. Jẹrisi ni {url} tabi a o di i",
                    "O PỌNDANDAN: Akọọlẹ {service} rẹ yoo di duro ni wakati {hours}. Ṣe imudojuiwọn ni {url}",
                    "{service} AABO: A rii iṣowo airotẹlẹ. Jẹrisi ẹni rẹ ni {url} lẹsẹkẹsẹ",
                    "IKILỌ IKẸHIN: Akọọlẹ {service} rẹ ti da duro. Mu pada: {url}. Fesi pẹlu PIN bi link ko ba ṣiṣẹ",
                ],
                'fake_credit': [
                    "Eku oriire! O ti gba {amount} lati {service}. Tẹ {url} lati gba owo rẹ",
                    "IFILỌLẸ OWO: {amount} ti wọle si apo {service} rẹ. Jẹrisi lati yọ: {url}",
                    "{service}: O bori {amount} ninu idije onibara wa! Gba ni {url}",
                    "O ti gba {amount} lati ọdọ ẹniti a ko mọ. Wo iṣowo ni {url}",
                    "IFILỌLẸ EBE: {service} n fun {amount} fun awọn olumulo laileto. A yan ọ! Gba: {url}",
                ],
                'otp_request': [
                    "{service}: Jọwọ jẹrisi koodu {otp} lati pari iṣowo. Ti kii ṣe iwọ, pe {phone}",
                    "Koodu ijẹrisi {service} rẹ ni {otp}. Pin eleyi pẹlu aṣoju wa ni {phone}",
                    "KOODU AABO: {otp}. Ile-iṣẹ {service} nilo eleyi lati yanju ọran rẹ. Pe {phone}",
                    "{service} rankoodu {otp}. Fesi pẹlu koodu yi lati mu akọọlẹ rẹ ṣiṣẹ",
                    "OTP: {otp}. Akọọlẹ {service} rẹ nilo ijẹrisi. Kan si atilẹyin {phone} pẹlu koodu yi",
                ],
                'customer_service': [
                    "Ile-iṣẹ {service}: Akọọlẹ rẹ nilo imudojuiwọn. Pe wa lẹsẹkẹsẹ ni {phone}",
                    "Eyi ni ẹgbẹ atilẹyin {service}. A rii awọn iṣoro pẹlu akọọlẹ rẹ. Pe wa ni {phone}",
                    "KILODE: {service} ri jibiti lori akọọlẹ rẹ. Pe {phone} BAYI lati daabobo owo rẹ",
                    "IFILỌLẸ {service}: Imudojuiwọn eto nilo ijẹrisi. Pe {phone} laarin wakati 2",
                    "PIN {service} rẹ ti kọja. Pe {phone} lati tun ṣeto tabi ṣabẹwo {url}",
                ],
                'help_scam': [
                    "Bawo ni, emi ni Amaka. Mo wa ni idaduro, mo nilo {amount} kiakia. Jọwọ firanṣẹ si {phone}",
                    "Arakunrin, ipaniyan! Mo nilo {amount} fun ile-iwosan. Firanṣẹ si nọmba {service} {phone}",
                    "Egbon/Arabinrin, {service} mi ni iṣoro. Ṣe o le ran mi lọwọ gba {amount}? Nọmba: {phone}",
                    "Bawo ni, ṣe o ranti mi lati ijo? Mo nilo iranlọwọ pẹlu {amount}. {service}: {phone}",
                    "Ibatan, foonu mi bajẹ. Mo nilo {amount} fun atunṣe. Firanṣẹ {service} {phone}",
                ],
                'sim_swap': [
                    "{service} AABO: A rii igbiyanju lati yipada SIM rẹ. Pe {phone} lati dena",
                    "IKILỌ: Ẹnikan gbiyanju lati yipada SIM rẹ. Jẹrisi idanimọ rẹ ni {url} bayi",
                    "IKILỌ: A rii iyipada SIM ti ko ni aṣẹ. {service} rẹ yoo di. Pe {phone}",
                    "{service}: Iyipada SIM n lọ lọwọ. Da duro pẹlu esi DURO {otp} tabi pe {phone}",
                    "KILODE: Jẹrisi ibeere iyipada SIM. Ti kii ṣe iwọ, pe {service} ni {phone}",
                ],
                'prize_lottery': [
                    "EKU ORIIRE! Nọmba rẹ bori {amount} ninu idije {service}. Gba ni {url}",
                    "Iwọ ni olubori oni! {service} n fun ọ ni {amount}. Tẹ {url} lati gba",
                    "{service} IDIJE: O bori {amount}! San {tax_amount} owo ilana si {phone} lati gba",
                    "IFILỌLẸ OLUBORI! A yan nọmba foonu rẹ fun {amount}. Jẹrisi: {url}",
                    "Idakeji orire: O bori {amount} lati {service}. Fi iwe-ẹri ranṣẹ si {phone}",
                ],
            },
            
            'igbo': {
                'account_suspension': [
                    "NGWA NGWA: Akaụntụ {service} gị akwụsịla n'ihi ọrụ na-adịghị mma. Pịa {url} iji kwenye n'ime awa 24",
                    "NKỌWA: Anyị hụrụ mmemme mbata n'akaụntụ {service} gị. Kwenye ugbu a na {url}",
                    "ACHỌRỌ OMUME: A ga-akwụsị akaụntụ {service} gị n'ime awa {hours}. Melite nkọwa gị na {url}",
                    "{service} NCHEKWA: Ahụrụ azụmahịa na-enweghị iwu. Kwenye onye ị bụ na {url} ozugbo",
                    "ỌKWA IKE AZỤ: Akwụsịla akaụntụ {service} gị. Weghachite: {url}. Zaa na PIN ma ọ bụrụ na link adịghị arụ ọrụ",
                ],
                'fake_credit': [
                    "Ekele! Ị natala {amount} site na {service}. Pịa {url} ka ị nara ego gị",
                    "MGBASA OZI EGO: {amount} banyere n'obere akpa {service} gị. Kwenye ka ịwepụta: {url}",
                    "{service}: Ị meriri {amount} na mmemme ndị ahịa anyị! Nara na {url}",
                    "Ị natala {amount} site n'aka onye amaghị aha. Lelee azụmahịa na {url}",
                    "MGBASA OZI PROMO: {service} na-enye {amount} nye ndị ọrụ. Ahọpụtala gị! Nara: {url}",
                ],
                'otp_request': [
                    "{service}: Biko kwenye koodu {otp} iji mechaa azụmahịa. Ọ bụrụ na ọ bụghị gị, kpọọ {phone}",
                    "Koodu nkwenye {service} gị bụ {otp}. Kesaa nke a na onye nnọchi anya anyị na {phone}",
                    "KOODU NCHEKWA: {otp}. Ọrụ nlekọta ndị ahịa {service} chọrọ nke a. Kpọọ {phone}",
                    "{service} zigara gị koodu {otp}. Zaa na koodu a iji mee ka akaụntụ gị rụọ ọrụ",
                    "OTP: {otp}. Akaụntụ {service} gị chọrọ nkwenye. Kpọtụrụ nkwado {phone} na koodu a",
                ],
                'customer_service': [
                    "Nlekọta Ndị Ahịa {service}: Akaụntụ gị chọrọ mmelite. Kpọọ anyị ozugbo na {phone}",
                    "Nke a bụ otu nkwado {service}. Anyị hụrụ nsogbu na akaụntụ gị. Kpọtụrụ anyị na {phone}",
                    "NGWA NGWA: {service} chọpụtara aghụghọ na akaụntụ gị. Kpọọ {phone} UGBU A iji chebe ego gị",
                    "MGBASA OZI {service}: Nkwalite sistemụ chọrọ nkwenye. Kpọọ {phone} n'ime awa 2",
                    "PIN {service} gị agafela. Kpọọ {phone} iji tọgharịa ma ọ bụ gaa {url}",
                ],
                'help_scam': [
                    "Ndewo, a bụ m Chioma. M nọ n'ihe isi ike, achọrọ m {amount} ngwa ngwa. Biko zipu na {phone}",
                    "Nwanne, ihe mberede! Achọrọ m {amount} maka ụlọ ọgwụ. Zipu na nọmba {service} {phone}",
                    "Nwanne/Dede, {service} m nwere nsogbu. Ị nwere ike inyere m aka ịnata {amount}? Nọmba: {phone}",
                    "Ndewo, ị chetara m site na ụka? Achọrọ m enyemaka na {amount}. {service}: {phone}",
                    "Nwanne nwanne, ekwentị m mebiri. Achọrọ m {amount} maka nrụzi. Zipu {service} {phone}",
                ],
                'sim_swap': [
                    "{service} NCHEKWA: Anyị hụrụ mgbalị ịgbanwe SIM gị. Kpọọ {phone} iji gbochie",
                    "NKỌWA: Onye nwara ịgbanwe SIM gị. Kwenye onye ị bụ na {url} ugbu a",
                    "ỊDỌ AKA NÁ NTỊ: Achọpụtara mgbanwe SIM na-enweghị ikike. A ga-egbochi {service} gị. Kpọọ {phone}",
                    "{service}: Mgbanwe SIM na-aga n'ihu. Kwụsị ya site na ịza KWỤSỊ {otp} ma ọ bụ kpọọ {phone}",
                    "NGWA NGWA: Kwenye arịrịọ mgbanwe SIM. Ọ bụrụ na ọ bụghị gị, kpọọ {service} na {phone}",
                ],
                'prize_lottery': [
                    "EKELE! Nọmba gị meriri {amount} na mmemme {service}. Nara na {url}",
                    "Ị bụ onye mmeri taa! {service} na-enye gị {amount}. Pịa {url} iji nata",
                    "{service} PROMO: Ị meriri {amount}! Kwụọ ụgwọ nhazi {tax_amount} na {phone} iji nara",
                    "MGBASA OZI ONYE MMERI! Ahọrọla nọmba ekwentị gị maka ihe nrite ego {amount}. Kwenye: {url}",
                    "Ntụrụndụ chioma: Ị meriri {amount} site na {service}. Ziga ID na {phone} iji hazie ịkwụ ụgwọ",
                ],
            },
            
            'hausa': {
                'account_suspension': [
                    "GAGGAWA: An dakatar da asusun {service} ku saboda ayyukan da ba a sani ba. Danna {url} don tabbatarwa cikin awanni 24",
                    "SANARWA: Mun gano shiga maras izini zuwa asusun {service} ku. Tabbatar yanzu a {url}",
                    "ANA BUKATA MATAKI: Za a kashe asusun {service} ku cikin awanni {hours}. Sabunta bayanai a {url}",
                    "{service} TSARO: An gano ma'amala maras izini. Tabbatar da kai a {url} nan take",
                    "GARGAƊI NA ƘARSHE: An dakatar da asusun {service} ku. Maido da shi: {url}. Ka amsa da PIN idan link bai yi aiki ba",
                ],
                'fake_credit': [
                    "Barka dai! Kun karbi {amount} daga {service}. Danna {url} don karbar kuɗin ku",
                    "SANARWAR KUƊI: {amount} ya shiga jakar {service} ku. Tabbatar don cirewa: {url}",
                    "{service}: Kun lashe {amount} a cikin shirin abokan ciniki! Karba a {url}",
                    "Kun karbi {amount} daga wanda ba a san sunansa ba. Duba ma'amala a {url}",
                    "SANARWAR KYAUTA: {service} yana ba da {amount} ga masu amfani bazuwar. An zaɓe ku! Karba: {url}",
                ],
                'otp_request': [
                    "{service}: Da fatan za a tabbatar da lambar {otp} don kammala ma'amala. Idan ba kai ba ne, kira {phone}",
                    "Lambar tabbatarwa ta {service} ku ita ce {otp}. Raba wannan da wakilinmu a {phone}",
                    "LAMBAR TSARO: {otp}. Ma'aikatan kula da abokan ciniki na {service} na buƙatar wannan. Kira {phone}",
                    "{service} ya aiko muku lambar {otp}. Ka amsa da wannan lambar don kunna asusun ku",
                    "OTP: {otp}. Asusun {service} ku yana buƙatar tabbatarwa. Tuntubi tallafi {phone} da wannan lambar",
                ],
                'customer_service': [
                    "Kula da Abokan Ciniki {service}: Asusun ku yana buƙatar sabuntawa. Ku kira mu nan take a {phone}",
                    "Wannan shine ƙungiyar tallafi ta {service}. Mun lura da matsaloli a asusun ku. Ku tuntube mu a {phone}",
                    "GAGGAWA: {service} ya gano zamba a asusun ku. Kira {phone} YANZU don kare kuɗin ku",
                    "SANARWA {service}: Haɓaka tsarin yana buƙatar tabbatarwa. Kira {phone} cikin awanni 2",
                    "PIN na {service} ku ya ƙare. Kira {phone} don sake saitawa ko ziyarci {url}",
                ],
                'help_scam': [
                    "Sannu, ni Fatima. Na makale kuma ina buƙatar {amount} gaggawa. Don Allah ku aika zuwa {phone}",
                    "Ɗan'uwa, gaggawa! Ina buƙatar {amount} don asibiti. Aika zuwa lambar {service} {phone}",
                    "Kawu/Uwar, {service} na yana da matsala. Za ku iya taimaka karɓar {amount}? Lamba: {phone}",
                    "Sannu, kun tuna da ni daga coci? Ina buƙatar taimako da {amount}. {service}: {phone}",
                    "Dan uwa, wayata ta lalace. Ina buƙatar {amount} don gyarawa. Aika {service} {phone}",
                ],
                'sim_swap': [
                    "{service} TSARO: Mun gano yunƙurin canza SIM ɗinku. Kira {phone} don toshe",
                    "SANARWA: Wani ya yi ƙoƙari ya canza SIM ɗinku. Tabbatar da kai a {url} yanzu",
                    "GARGAƊI: An gano canjin SIM maras izini. Za a toshe {service} ku. Kira {phone}",
                    "{service}: Canjin SIM yana gudana. Tsai da shi ta hanyar amsa TSAYA {otp} ko kira {phone}",
                    "GAGGAWA: Tabbatar da buƙatar canjin SIM. Idan ba kai ba ne, kira {service} a {phone}",
                ],
                'prize_lottery': [
                    "BARKA DAI! Lambar ku ta lashe {amount} a cikin kyautar {service}. Karba a {url}",
                    "Kai ne mai nasara na yau! {service} yana ba ku {amount}. Danna {url} don karɓa",
                    "{service} KYAUTA: Kun lashe {amount}! Biya kuɗin aiki {tax_amount} zuwa {phone} don karɓa",
                    "SANARWAR MAI NASARA! An zaɓi lambar wayar ku don kyautar kuɗi {amount}. Tabbatar: {url}",
                    "Zaben sa'a: Kun lashe {amount} daga {service}. Aika ID zuwa {phone} don sarrafa biyan kuɗi",
                ],
            },
            
            'swahili': {
                'account_suspension': [
                    "HARAKA: Akaunti yako ya {service} imesimamishwa kwa sababu ya shughuli za ajabu. Bonyeza {url} kuthibitisha ndani ya saa 24",
                    "ONYO: Tumeona kuingia kwa hila kwenye akaunti yako ya {service}. Thibitisha sasa kwenye {url}",
                    "INAHITAJIKA: Akaunti yako ya {service} itazimwa ndani ya saa {hours}. Sasisha maelezo yako kwenye {url}",
                    "{service} USALAMA: Muamala wa ajabu umegunduliwa. Thibitisha utambulisho wako kwenye {url} mara moja",
                    "ONYO LA MWISHO: Akaunti yako ya {service} imesimamishwa. Rejesha: {url}. Jibu na PIN kama kiungo hakifanyi kazi",
                ],
                'fake_credit': [
                    "Hongera! Umepokea {amount} kutoka {service}. Bonyeza {url} kudai pesa zako",
                    "TAARIFA YA PESA: {amount} imewekwa kwenye pochi yako ya {service}. Thibitisha kutoa: {url}",
                    "{service}: Umeshinda {amount} katika promosheni ya wateja! Dai kwenye {url}",
                    "Umepokea {amount} kutoka kwa mtumaji asiyejulikana. Angalia muamala kwenye {url}",
                    "TAARIFA YA ZAWADI: {service} inatoa {amount} kwa watumiaji wa nasibu. Umechaguliwa! Dai: {url}",
                ],
                'otp_request': [
                    "{service}: Tafadhali thibitisha nambari {otp} kukamilisha muamala. Kama si wewe, piga {phone}",
                    "Nambari yako ya kuthibitisha ya {service} ni {otp}. Shiriki hii na wakala wetu kwenye {phone}",
                    "MSIMBO WA USALAMA: {otp}. Huduma kwa wateja wa {service} inahitaji hii. Piga simu {phone}",
                    "{service} imekutumia nambari {otp}. Jibu na msimbo huu kuwezesha akaunti yako",
                    "OTP: {otp}. Akaunti yako ya {service} inahitaji uthibitisho. Wasiliana na usaidizi {phone} na msimbo huu",
                ],
                'customer_service': [
                    "Huduma kwa Wateja wa {service}: Akaunti yako inahitaji usasishaji. Tupigie mara moja kwenye {phone}",
                    "Hii ni timu ya usaidizi wa {service}. Tumeona matatizo na akaunti yako. Tufikie kwenye {phone}",
                    "HARAKA: {service} imebaini ulaghai kwenye akaunti yako. Piga {phone} SASA kulinda pesa zako",
                    "TAARIFA YA {service}: Uboreshaji wa mfumo unahitaji uthibitisho. Piga simu {phone} ndani ya saa 2",
                    "PIN yako ya {service} imeisha muda. Piga {phone} kuweka upya au tembelea {url}",
                ],
                'help_scam': [
                    "Habari, mimi ni Amina. Niko kwenye shida, nahitaji {amount} haraka. Tafadhali tuma kwenye {phone}",
                    "Kaka, dharura! Ninahitaji {amount} kwa hospitali. Tuma kwenye nambari ya {service} {phone}",
                    "Shangazi/Mjomba, {service} yangu ina tatizo. Unaweza nisaidia kupokea {amount}? Nambari: {phone}",
                    "Habari, unakumbuka mimi kutoka kanisani? Nahitaji msaada na {amount}. {service}: {phone}",
                    "Binamu, simu yangu imeharibika. Ninahitaji {amount} kwa ukarabati. Tuma {service} {phone}",
                ],
                'sim_swap': [
                    "{service} USALAMA: Tumeona jaribio la kubadilisha SIM yako. Piga {phone} kuzuia",
                    "ONYO: Mtu amejaribu kubadilisha SIM yako. Thibitisha utambulisho wako kwenye {url} sasa",
                    "ONYO: Mabadiliko ya SIM yasiyoidhinishwa yamegunduliwa. {service} yako itazuiliwa. Piga {phone}",
                    "{service}: Mabadiliko ya SIM yanaendelea. Simamisha kwa kujibu SIMAMISHA {otp} au piga {phone}",
                    "HARAKA: Thibitisha ombi la kubadilisha SIM. Kama si wewe, piga {service} kwenye {phone}",
                ],
                'prize_lottery': [
                    "HONGERA! Nambari yako imeshinda {amount} katika promosheni ya {service}. Dai kwenye {url}",
                    "Wewe ndiye mshindi wa leo! {service} inakupa {amount}. Bonyeza {url} kupokea",
                    "{service} ZAWADI: Umeshinda {amount}! Lipa ada ya usindikaji {tax_amount} kwenye {phone} kudai",
                    "TAARIFA YA MSHINDI! Nambari yako ya simu imechaguliwa kwa zawadi ya pesa {amount}. Thibitisha: {url}",
                    "Bahati nasibu: Umeshinda {amount} kutoka {service}. Tuma kitambulisho kwenye {phone} kusindika malipo",
                ],
            },
            
            'pidgin': {
                'account_suspension': [
                    "URGENT: Dem don suspend your {service} account because of activity wey no normal. Click {url} make you verify am for 24 hours or you go lose access forever.",
                    "ALERT: We don see suspicious login for your {service} account. Verify now for {url} or dem go block your account.",
                    "ACTION REQUIRED: Dem go deactivate your {service} account for {hours} hours time. Update your details for {url}",
                    "{service} SECURITY: We don detect unusual transaction. Confirm say na you for {url} sharp sharp.",
                    "FINAL WARNING: Dem don suspend your {service} account. Restore access: {url}. Reply with PIN if link no dey work.",
                ],
                'fake_credit': [
                    "Congrats! You don receive {amount} from {service}. Click {url} make you collect your money.",
                    "CREDIT ALERT: {amount} don enter your {service} wallet. Verify make you withdraw: {url}",
                    "{service}: You win {amount} for our customer loyalty promo! Collect am for {url}",
                    "You don receive {amount} from person wey we no know. Check transaction for {url}",
                    "PROMO ALERT: {service} dey give {amount} to random users. Dem don select you! Collect: {url}",
                ],
                'otp_request': [
                    "{service}: Abeg confirm OTP {otp} make transaction complete. If no be you start am, call {phone}",
                    "Your {service} verification code na {otp}. Share this one with our agent for {phone} make you verify account",
                    "SECURITY CODE: {otp}. {service} customer care need this one make dem resolve your issue. Call {phone}",
                    "{service} send you verification code {otp}. Reply with this code make you activate your account",
                    "OTP: {otp}. Your {service} account need verification. Contact support {phone} with this code",
                ],
                'customer_service': [
                    "{service} Customer Care: Your account need update. Call us sharp sharp for {phone}",
                    "This na {service} support team. We don notice wahala with your account. Reach us for {phone}",
                    "URGENT: {service} don detect fraud for your account. Contact {phone} NOW make you secure your money",
                    "{service} ALERT: System upgrade need verification. Call {phone} for inside 2 hours",
                    "Your {service} PIN don expire. Call {phone} make you reset am or visit {url}",
                ],
                'help_scam': [
                    "Hello, na me be Amaka. I dey stranded and I need {amount} urgently. Abeg send to {phone}. I go refund tomorrow!",
                    "Brother, emergency! I need {amount} for hospital. Send to this {service} number {phone}. God go bless you",
                    "Uncle/Aunty, my {service} dey give problem. You fit help me receive {amount} and send cash? Number: {phone}",
                    "Hi, you remember me from church? I need help with {amount} sharp sharp. {service}: {phone}. Thanks o!",
                    "Cousin, phone don spoil. I need {amount} for repair make I call mama. Send {service} {phone}. I go pay back",
                ],
                'sim_swap': [
                    "{service} SECURITY: We don detect SIM swap attempt for your line. Call {phone} make you block am",
                    "ALERT: Person try swap your SIM. Verify your identity for {url} now now",
                    "WARNING: Dem don detect unauthorized SIM change. Dem go block your {service}. Call {phone}",
                    "{service}: SIM swap dey progress. Stop am by replying STOP {otp} or call {phone}",
                    "URGENT: Confirm SIM swap request. If no be you, call {service} for {phone} immediately",
                ],
                'prize_lottery': [
                    "CONGRATULATIONS! Your number win {amount} for {service} promo. Collect for {url}",
                    "You be today lucky winner! {service} dey give you {amount}. Click {url} make you receive am",
                    "{service} PROMO: You win {amount}! Pay {tax_amount} processing fee to {phone} make you collect",
                    "WINNER ALERT! Dem don select your phone number for {amount} cash prize. Verify: {url}",
                    "Lucky draw: You win {amount} from {service}. Send ID to {phone} make dem process payment",
                ],
                'tax_fee': [
                    "Your {service} transaction of {amount} need {tax_amount} tax clearance. Pay to {phone}",
                    "CUSTOMS ALERT: {amount} package dey wait for delivery. Pay {tax_amount} clearance to {phone}",
                    "{service}: To receive {amount}, pay {tax_amount} processing fee first to {phone}",
                    "Your money {amount} don ready. Government tax {tax_amount} must pay to {phone}",
                    "CLAIM NOTICE: {amount} dey wait. Transfer {tax_amount} activation fee to {url}",
                ],
            },
        }
    
    def generate_phone_number(self, country='nigeria'):
        """Generate realistic phone numbers"""
        if country == 'nigeria':
            prefixes = ['0803', '0806', '0810', '0813', '0816', '0703', '0706', '0708', '0802', '0808', '0812', '0902']
            return random.choice(prefixes) + ''.join([str(random.randint(0, 9)) for _ in range(7)])
        elif country == 'kenya':
            prefixes = ['0701', '0702', '0703', '0704', '0710', '0711', '0712', '0720', '0721', '0722']
            return random.choice(prefixes) + ''.join([str(random.randint(0, 9)) for _ in range(6)])
        elif country == 'tanzania':
            prefixes = ['0714', '0715', '0716', '0754', '0755', '0756', '0762', '0763', '0764']
            return random.choice(prefixes) + ''.join([str(random.randint(0, 9)) for _ in range(6)])
        return '080' + ''.join([str(random.randint(0, 9)) for _ in range(8)])
    
    def generate_url(self):
        """Generate realistic phishing URLs"""
        domains = [
            'bit.ly', 'tinyurl.com', 'shorturl.at', 'cutt.ly', 'rb.gy',
            'mtn-verify', 'airtel-secure', 'mpesa-verify', 'bank-secure',
            'account-verify', 'mobile-money', 'secure-login'
        ]
        
        if random.random() > 0.5:
            # Short URL style
            return f"https://{random.choice(domains[:5])}/{random.choice('abcdefghijklmnopqrstuvwxyz')}{random.randint(100, 999)}"
        else:
            # Fake domain style
            base = random.choice(domains[5:])
            tld = random.choice(['.com', '.net', '.co', '.ng', '.ke', '.tz'])
            path = random.choice(['verify', 'secure', 'login', 'account', 'confirm'])
            return f"https://{base}{tld}/{path}"
    
    def generate_amount(self, currency='NGN'):
        """Generate realistic transaction amounts"""
        amounts = {
            'NGN': [500, 1000, 2000, 5000, 10000, 15000, 20000, 25000, 50000, 100000, 250000, 500000],
            'KES': [100, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000],
            'TZS': [5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000],
        }
        
        amount = random.choice(amounts.get(currency, amounts['NGN']))
        
        # Format with currency
        if currency == 'NGN':
            return f"₦{amount:,}"
        elif currency == 'KES':
            return f"KES {amount:,}"
        elif currency == 'TZS':
            return f"TSh {amount:,}"
        return f"{currency} {amount:,}"
    
    def generate_otp(self):
        """Generate OTP codes"""
        return ''.join([str(random.randint(0, 9)) for _ in range(random.choice([4, 6]))])
    
    def generate_phishing_message(self, language, scam_type):
        """Generate a single phishing message"""
        templates = self.templates[language][scam_type]
        template = random.choice(templates)
        
        # Determine country based on language
        if language in ['yoruba', 'igbo', 'hausa', 'pidgin']:
            country = 'nigeria'
            currency = 'NGN'
        elif language == 'swahili':
            country = random.choice(['kenya', 'tanzania'])
            currency = 'KES' if country == 'kenya' else 'TZS'
        else:
            country = 'nigeria'
            currency = 'NGN'
        
        # Fill in template variables
        message = template.format(
            service=random.choice(self.services[language]),
            url=self.generate_url(),
            phone=self.generate_phone_number(country),
            amount=self.generate_amount(currency),
            tax_amount=self.generate_amount(currency),
            otp=self.generate_otp(),
            hours=random.choice([2, 4, 6, 12, 24, 48])
        )
        
        return message
    
    def generate_legitimate_message(self, language):
        """Generate legitimate mobile money messages"""
        legitimate_templates = {
            'english': [
                "You have received {amount} from {name}. Your new balance is {balance}. Transaction ID: {txn_id}",
                "{service} transaction successful. You sent {amount} to {phone}. Charges: {fee}. Balance: {balance}",
                "Dear customer, your {service} account balance is {balance}. Thank you for using our service.",
                "You have successfully recharged {phone} with {amount} airtime. Transaction ref: {txn_id}",
                "Your bill payment of {amount} to {name} was successful. Receipt no: {txn_id}",
            ],
            'yoruba': [
                "O ti gba {amount} lati ọdọ {name}. Iye owo tuntun rẹ ni {balance}. ID iṣowo: {txn_id}",
                "Iṣowo {service} ṣaṣeyọri. O firanṣẹ {amount} si {phone}. Idiyele: {fee}. Iye owo: {balance}",
                "Onibara olufẹ, iye owo akọọlẹ {service} rẹ ni {balance}. O ṣeun fun lilo iṣẹ wa.",
                "O ti ṣe atunse {phone} pẹlu airtime {amount} ni aṣeyọri. Itọka: {txn_id}",
            ],
            'igbo': [
                "Ị natala {amount} site na {name}. Ngụkọta ego gị ọhụrụ bụ {balance}. ID azụmahịa: {txn_id}",
                "Azụmahịa {service} gara nke ọma. Ị zigara {amount} na {phone}. Ụgwọ: {fee}. Ngụkọta: {balance}",
                "Onye ahịa dị ezigbo mma, ngụkọta ego akaụntụ {service} gị bụ {balance}. Daalụ maka iji ọrụ anyị.",
            ],
            'hausa': [
                "Kun karbi {amount} daga {name}. Sabon ma'aunin ku shine {balance}. ID ma'amala: {txn_id}",
                "{service} ma'amala ya yi nasara. Kun aika {amount} zuwa {phone}. Kuɗi: {fee}. Ma'auni: {balance}",
                "Abokin ciniki masoyi, ma'aunin asusun {service} ku shine {balance}. Godiya da amfani da hidimar mu.",
            ],
            'swahili': [
                "Umepokea {amount} kutoka kwa {name}. Salio lako jipya ni {balance}. Kitambulisho cha muamala: {txn_id}",
                "Muamala wa {service} umefanikiwa. Umetuma {amount} kwa {phone}. Ada: {fee}. Salio: {balance}",
                "Mteja mpendwa, salio la akaunti yako ya {service} ni {balance}. Asante kwa kutumia huduma yetu.",
            ],
            'pidgin': [
                "You don receive {amount} from {name}. Your new balance na {balance}. Transaction ID: {txn_id}",
                "{service} transaction successful. You send {amount} to {phone}. Charges: {fee}. Balance: {balance}",
                "Dear customer, your {service} account balance na {balance}. Thank you for using our service.",
            ],
        }
        
        template = random.choice(legitimate_templates[language])
        
        # Determine country based on language
        if language in ['yoruba', 'igbo', 'hausa', 'pidgin']:
            country = 'nigeria'
            currency = 'NGN'
        elif language == 'swahili':
            country = random.choice(['kenya', 'tanzania'])
            currency = 'KES' if country == 'kenya' else 'TZS'
        else:
            country = 'nigeria'
            currency = 'NGN'
        
        names = ['John Doe', 'Jane Smith', 'DSTV', 'EKEDC', 'PHCN', 'LAWMA', 'Jumia', 'Konga']
        
        message = template.format(
            service=random.choice(self.services[language]),
            name=random.choice(names),
            phone=self.generate_phone_number(country),
            amount=self.generate_amount(currency),
            balance=self.generate_amount(currency),
            fee=self.generate_amount(currency).replace(currency + ' ', '').replace('₦', '').replace('KES ', '').replace('TSh ', ''),
            txn_id=''.join([random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') for _ in range(10)])
        )
        
        return message
    
    def generate_dataset(self, language, num_phishing=1000, num_legitimate=300):
        """Generate complete dataset for a language"""
        dataset = []
        
        # Get all scam types for this language
        scam_types = list(self.templates[language].keys())
        
        # Generate phishing messages
        print(f"Generating {num_phishing} phishing messages in {language}...")
        messages_per_type = num_phishing // len(scam_types)
        
        for scam_type in scam_types:
            for i in range(messages_per_type):
                try:
                    message = self.generate_phishing_message(language, scam_type)
                    dataset.append({
                        'message': message,
                        'label': 'phishing',
                        'language': language,
                        'scam_type': scam_type,
                        'source': 'synthetic'
                    })
                except Exception as e:
                    print(f"Error generating {scam_type} in {language}: {e}")
                    continue
        
        # Generate legitimate messages
        print(f"Generating {num_legitimate} legitimate messages in {language}...")
        for i in range(num_legitimate):
            try:
                message = self.generate_legitimate_message(language)
                dataset.append({
                    'message': message,
                    'label': 'legitimate',
                    'language': language,
                    'scam_type': 'none',
                    'source': 'synthetic'
                })
            except Exception as e:
                print(f"Error generating legitimate message in {language}: {e}")
                continue
        
        return dataset
    
    def save_dataset(self, dataset, filename, format='csv'):
        """Save dataset to file"""
        if format == 'csv':
            with open(filename, 'w', newline='', encoding='utf-8') as f:
                if dataset:
                    writer = csv.DictWriter(f, fieldnames=dataset[0].keys())
                    writer.writeheader()
                    writer.writerows(dataset)
        elif format == 'json':
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(dataset, f, ensure_ascii=False, indent=2)
        
        print(f"Saved {len(dataset)} messages to {filename}")
    
    def generate_all_languages(self, output_dir='phishing_dataset'):
        """Generate datasets for all languages"""
        # Create output directory
        os.makedirs(output_dir, exist_ok=True)
        
        languages = ['english', 'yoruba', 'igbo', 'hausa', 'swahili', 'pidgin']
        all_data = []
        
        for language in languages:
            print(f"\n{'='*50}")
            print(f"Processing {language.upper()}")
            print(f"{'='*50}")
            
            # Generate dataset for this language
            dataset = self.generate_dataset(language, num_phishing=1000, num_legitimate=300)
            all_data.extend(dataset)
            
            # Save individual language file
            self.save_dataset(dataset, f"{output_dir}/{language}_phishing_dataset.csv", format='csv')
            self.save_dataset(dataset, f"{output_dir}/{language}_phishing_dataset.json", format='json')
        
        # Save combined dataset
        print(f"\n{'='*50}")
        print("Saving combined dataset...")
        print(f"{'='*50}")
        self.save_dataset(all_data, f"{output_dir}/all_languages_combined.csv", format='csv')
        self.save_dataset(all_data, f"{output_dir}/all_languages_combined.json", format='json')
        
        # Print statistics
        print(f"\n{'='*50}")
        print("DATASET STATISTICS")
        print(f"{'='*50}")
        print(f"Total messages generated: {len(all_data)}")
        print(f"\nBreakdown by language:")
        for language in languages:
            lang_data = [d for d in all_data if d['language'] == language]
            phishing_count = len([d for d in lang_data if d['label'] == 'phishing'])
            legitimate_count = len([d for d in lang_data if d['label'] == 'legitimate'])
            print(f"  {language.capitalize()}: {len(lang_data)} total ({phishing_count} phishing, {legitimate_count} legitimate)")
        
        print(f"\nFiles saved in '{output_dir}/' directory")
        print("✓ Individual language CSV files")
        print("✓ Individual language JSON files")
        print("✓ Combined dataset (all_languages_combined.csv)")
        print("✓ Combined dataset (all_languages_combined.json)")


# Main execution
if __name__ == "__main__":
    print("=" * 70)
    print("MULTILINGUAL PHISHING DATASET GENERATOR")
    print("For African Languages: English, Yoruba, Igbo, Hausa, Swahili, Pidgin")
    print("=" * 70)
    print()
    
    generator = PhishingDatasetGenerator()
    
    # Generate all datasets
    generator.generate_all_languages(output_dir='phishing_dataset')
    
    print("\n" + "=" * 70)
    print("GENERATION COMPLETE!")
    print("=" * 70)
    print("\nNext steps:")
    print("1. Review the generated datasets for quality")
    print("2. Add real crowdsourced examples when they come in")
    print("3. Start training your model!")
    print("\nDataset ready for model training 🚀")
