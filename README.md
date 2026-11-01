# Katak daftar

Talabalar uchun elektron daftar. Mavzularni yozasiz, sarlavha yoki so'z bo'yicha qidirasiz, tushunmagan joyingizda AI'dan so'raysiz.

- Mavzular har bir foydalanuvchining o'z telefonida yoki kompyuterida (brauzer xotirasida) saqlanadi.
- Faqat AI so'rovlarining matni server orqali Claude'ga boradi. Server mavzu matnini saqlamaydi.
- Har bir foydalanuvchiga kuniga 30 ta AI so'rov, hamma uchun jami kuniga 600 ta. Bu AI xarajatini cheklaydi.

## 1. API kalit olish

1. https://console.anthropic.com saytiga kiring va hisob oching.
2. Billing bo'limida hisobni to'ldiring. Avval oz miqdor (masalan, 5 dollar) yetadi.
3. Imkoni bo'lsa, oylik sarf limitini qo'ying, shunda kutilmagan xarajat bo'lmaydi.
4. API Keys bo'limida yangi kalit yarating va nusxalab oling. Kalitni hech kimga bermang va GitHub'ga yuklamang.

## 2. Kompyuterda sinash

Kompyuteringizda Node.js (18 yoki yangiroq) o'rnatilgan bo'lishi kerak.

```
npm install
cp .env.example .env
```

`.env` faylini oching va `ANTHROPIC_API_KEY=` dan keyin kalitingizni yozing. Keyin:

```
npm start
```

Brauzerda http://localhost:3000 ni oching.

AI'siz, faqat sahifani sinash uchun: `npm run test:mock` (haqiqiy AI o'rniga tayyor matn qaytaradi, pul sarflanmaydi).

## 3. Internetga chiqarish (Render misolida)

1. Bu papkani GitHub'da yangi repozitoriyga yuklang (`.env` yuklanmaydi, `.gitignore` buni oldini oladi).
2. https://render.com da hisob oching, "New" > "Web Service" ni tanlab, repozitoriyni ulang.
3. Sozlamalar: Build Command: `npm install`, Start Command: `npm start`.
4. "Environment" bo'limida `ANTHROPIC_API_KEY` o'zgaruvchisini qo'shing va kalitni qo'ying.
5. Deploy tugagach, Render bergan havola orqali sayt ochiladi. Shu havolani kursdoshlaringizga yuboring.

Bepul tarifdagi serverlar ko'pincha uzoq ishlatilmasa uxlab qoladi, shuning uchun birinchi ochilish sekinroq bo'lishi mumkin.

## Sozlamalar (ixtiyoriy)

Hosting'dagi "Environment" bo'limida yoki `.env` faylida:

| O'zgaruvchi | Ma'nosi | Boshlang'ich qiymat |
| --- | --- | --- |
| `MODEL` | Qaysi Claude modeli ishlatiladi | `claude-sonnet-5-5` |
| `USER_DAILY_LIMIT` | Bitta foydalanuvchiga kuniga so'rovlar | 30 |
| `GLOBAL_DAILY_LIMIT` | Hamma uchun kuniga so'rovlar | 600 |
| `MAX_TOKENS` | Bitta javob uzunligi chegarasi | 700 |

Xarajatni kamaytirish uchun `MODEL` ni `claude-haiku-5-5` ga almashtirish mumkin: arzonroq va tezroq, lekin murakkab tushuntirishlar biroz sodda bo'lishi mumkin. Narxlarni https://docs.claude.com sahifasidan tekshiring.

## Eslatmalar

- Limitlar server xotirasida turadi, server qayta ishga tushsa nolga tushadi. Kursdoshlar bilan sinov uchun yetarli, ko'p odamga chiqarishdan oldin hisoblar (login) qo'shish kerak.
- Mavzular faqat o'sha brauzerda. Brauzer ma'lumotlari tozalansa yoki telefon almashtirilsa, mavzular yo'qoladi. Hisoblar qo'shilganda bu hal bo'ladi.

## Loyiha tuzilishi

- `server.js`: sahifani beradi, `/api/ai` orqali Claude'ga so'rov yuboradi, limitlarni tekshiradi.
- `public/index.html`: daftarning o'zi (sahifa, uslub va dastur bitta faylda).
