require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose'); // <-- Muhim: mongoose import qilindi!

const app = express();
const PORT = process.env.PORT || 3000;

// .env faylda quyidagilar bo'lishi KERAK:
// BOT_TOKEN=8574427558:AAGjdX1vgQijYKDv-UncC2BJN4OU2_MPLRg
// MONGO_URI=mongodb+srv://abumafia0:abumafia0@abumafia.h1trttg.mongodb.net/bdbot?retryWrites=true&w=majority
// WEBHOOK_URL=https://bulldropkod.onrender.com

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const WEBHOOK_URL = process.env.WEBHOOK_URL?.replace(/\/$/, ''); // oxirgi / ni olib tashlaydi

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN .env faylda yo‘q!');
  process.exit(1);
}
if (!MONGO_URI) {
  console.error('❌ MONGO_URI .env faylda yo‘q!');
  process.exit(1);
}
if (!WEBHOOK_URL) {
  console.error('❌ WEBHOOK_URL .env faylda yo‘q! Render URL ni kiriting.');
  process.exit(1);
}

// MongoDB ulanish
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB ga ulandi'))
  .catch(err => {
    console.error('❌ MongoDB ulanmadi:', err);
    process.exit(1);
  });

// Schemalar
const UserSchema = new mongoose.Schema({
  userId: { type: Number, unique: true, required: true },
  username: String,
  firstName: String,
  lastName: String,
  referrals: { type: Number, default: 0 },
  referralCode: String,
  referredBy: { type: Number, default: null },
  lastPromoDate: Date,
  usedPromoCodes: [String],
  createdAt: { type: Date, default: Date.now }
});

const PromoCodeSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  addedBy: Number,
  addedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

const User = mongoose.model('User', UserSchema);
const PromoCode = mongoose.model('PromoCode', PromoCodeSchema);

// Bot yaratish
const bot = new Telegraf(BOT_TOKEN);

// Admin ID
const ADMIN_IDS = [6606638731];

// Keyboardlar
const mainKeyboard = Markup.keyboard([
  ['🎁 Kundalik promokod', '👥 Referal havolam'],
  ['📜 Mening promokodlarim', '📊 Statistika']
]).resize();

const adminKeyboard = Markup.keyboard([
  ['➕ Promokod qo\'shish', '🗑️ Promokod o\'chirish'],
  ['📋 Barcha promokodlar', '👥 Foydalanuvchilar'],
  ['📊 Bot statistikasi', '🔙 Asosiy menyu']
]).resize();

// Funksiyalar
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generatePromoCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function getOrCreateUser(userId, userData) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({
      userId,
      username: userData.username,
      firstName: userData.first_name,
      lastName: userData.last_name,
      referralCode: generateReferralCode()
    });
    await user.save();
  }
  return user;
}

// State management
const userStates = {};

// ================== BOT HANDLERLARI ==================

bot.start(async (ctx) => {
  console.log('Start command:', ctx.from.id);
  const userId = ctx.from.id;
  const user = await getOrCreateUser(userId, ctx.from);

  // Referal tekshirish
  const referralParam = ctx.startPayload;
  if (referralParam && referralParam.startsWith('ref_')) {
    const referrerCode = referralParam.replace('ref_', '');
    const referrer = await User.findOne({ referralCode: referrerCode });

    if (referrer && referrer.userId !== userId && !user.referredBy) {
      referrer.referrals += 1;
      await referrer.save();
      user.referredBy = referrer.userId;
      await user.save();

      await ctx.reply(`✅ Siz ${referrer.firstName || referrer.username} tomonidan taklif qilindingiz!\n🎁 Qo'shimcha imkoniyatlar ochildi!`);
    }
  }

  if (ADMIN_IDS.includes(userId)) {
    await ctx.reply(
      `👋 Admin xush kelibsiz, ${ctx.from.first_name}!\n🤖 Bulldrop Promokod Botiga xush kelibsiz!`,
      adminKeyboard
    );
  } else {
    await ctx.reply(
      `👋 Salom ${ctx.from.first_name}!\n🎁 Bulldrop Promokod Botiga xush kelibsiz!\n\n` +
      `📌 Ma'lumotlarim:\n👥 Referallar: ${user.referrals} ta\n🎁 Promokodlar: ${user.usedPromoCodes.length} ta\n\n` +
      `👇 Menyudan tanlang:`,
      mainKeyboard
    );
  }
});

// Kundalik promokod
bot.hears('🎁 Kundalik promokod', async (ctx) => {
  const userId = ctx.from.id;
  const user = await User.findOne({ userId });
  if (!user) return ctx.reply('❌ /start buyrug\'ini bosing.', mainKeyboard);

  const now = new Date();
  if (user.lastPromoDate) {
    const hoursDiff = (now - user.lastPromoDate) / (1000 * 60 * 60);
    if (hoursDiff < 24) {
      const hoursLeft = Math.ceil(24 - hoursDiff);
      return ctx.reply(`⏳ ${hoursLeft} soat kutishingiz kerak!\n👥 Do'st taklif qilib tezroq oling!`, mainKeyboard);
    }
  }

  const availablePromo = await PromoCode.findOneAndDelete({ isActive: true });
  if (!availablePromo) {
    return ctx.reply('❌ Promokodlar tugadi.\n📢 Tez orada yangi kodlar qo\'shiladi!', mainKeyboard);
  }

  user.lastPromoDate = now;
  user.usedPromoCodes.push(availablePromo.code);
  await user.save();

  await ctx.reply(
    `🎉 **TABRIKLAYMIZ!**\n\n🔑 **Promokodingiz:** \`${availablePromo.code}\`\n\n` +
    `📝 Bir marta ishlatiladi!\n⏳ Keyingi: 24 soatdan keyin\n👥 Referal orqali qo‘shimcha oling!`,
    { parse_mode: 'Markdown', reply_markup: mainKeyboard.reply_markup }
  );
});

// Referal havola
bot.hears('👥 Referal havolam', async (ctx) => {
  const user = await User.findOne({ userId: ctx.from.id });
  if (!user) return ctx.reply('❌ /start buyrug\'ini bosing.', mainKeyboard);

  const botUsername = (await bot.telegram.getMe()).username;
  const referralLink = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;
  const shareText = `🎁 *Bulldrop Promokod Boti*\n\nHar kuni bepul promokod oling!\n👇 Kirish:`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;

  await ctx.reply(
    `👥 **Referal havolangiz:**\n\n${referralLink}\n\n` +
    `📊 Statistika:\n✅ Takliflar: ${user.referrals} ta\n🎁 Qo'shimcha promokod: ${user.referrals} ta\n\n` +
    `📌 Har taklif uchun 1 ta qo‘shimcha promokod!`,
    Markup.inlineKeyboard([Markup.button.url('📲 Ulashish', shareUrl)])
  );
});

// Mening promokodlarim
bot.hears('📜 Mening promokodlarim', async (ctx) => {
  const user = await User.findOne({ userId: ctx.from.id });
  if (!user) return ctx.reply('❌ /start buyrug\'ini bosing.', mainKeyboard);

  if (user.usedPromoCodes.length === 0) {
    return ctx.reply('📭 Hozircha promokod yo‘q.\n🎁 "Kundalik promokod" ni bosing!', mainKeyboard);
  }

  const promos = user.usedPromoCodes.slice(-10).reverse();
  let message = `📜 **Oxirgi ${promos.length} ta promokodingiz:**\n\n`;
  promos.forEach((code, i) => message += `${i + 1}. \`${code}\`\n`);
  message += `\n🎁 Jami: ${user.usedPromoCodes.length} ta`;

  await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: mainKeyboard.reply_markup });
});

// Statistika
bot.hears('📊 Statistika', async (ctx) => {
  const user = await User.findOne({ userId: ctx.from.id });
  if (!user) return ctx.reply('❌ /start buyrug\'ini bosing.', mainKeyboard);

  const now = new Date();
  let nextPromoTime = "Hozir olish mumkin";
  if (user.lastPromoDate) {
    const next = new Date(user.lastPromoDate.getTime() + 24 * 3600000);
    if (next > now) {
      const hours = Math.ceil((next - now) / 3600000);
      nextPromoTime = `${hours} soatdan keyin`;
    }
  }

  const totalUsers = await User.countDocuments();
  const activePromos = await PromoCode.countDocuments({ isActive: true });

  await ctx.reply(
    `📊 **SIZNING STATISTIKANGIZ**\n\n` +
    `👤 Ism: ${user.firstName || 'Noma\'lum'}\n` +
    `👥 Referallar: ${user.referrals} ta\n` +
    `🎁 Olingan promokodlar: ${user.usedPromoCodes.length} ta\n` +
    `⏳ Keyingi promokod: ${nextPromoTime}\n\n` +
    `📈 **UMUMIY**\n` +
    `👥 Jami foydalanuvchilar: ${totalUsers} ta\n` +
    `🎁 Mavjud promokodlar: ${activePromos} ta`,
    mainKeyboard
  );
});

// ================== ADMIN PANEL ==================

bot.hears('🔙 Asosiy menyu', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return ctx.reply('❌ Faqat admin!', mainKeyboard);
  delete userStates[ctx.from.id];
  await ctx.reply('👇 Admin panel:', adminKeyboard);
});

bot.hears('➕ Promokod qo\'shish', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return ctx.reply('❌ Faqat admin!', mainKeyboard);
  userStates[ctx.from.id] = { addingPromo: true };
  await ctx.reply(
    '📝 Promokod qo‘shish:\n\n"auto" — avto generatsiya\nYoki o‘zingiz yozing (6-20 belgi)\n\n"cancel" — bekor qilish',
    Markup.keyboard([['auto'], ['cancel']]).resize()
  );
});

bot.hears('🗑️ Promokod o\'chirish', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return ctx.reply('❌ Faqat admin!', mainKeyboard);
  const promos = await PromoCode.find({ isActive: true }).limit(50);
  if (promos.length === 0) return ctx.reply('📭 O‘chirish uchun kod yo‘q!', adminKeyboard);

  let msg = '🗑️ **O‘chirish uchun tanlang:**\n\n';
  const buttons = [];
  promos.forEach((p, i) => {
    msg += `${i + 1}. \`${p.code}\`\n`;
    buttons.push([Markup.button.callback(p.code, `delete_${p.code}`)]);
  });
  buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_delete')]);

  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
});

bot.hears('📋 Barcha promokodlar', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return ctx.reply('❌ Faqat admin!', mainKeyboard);
  const promos = await PromoCode.find({ isActive: true }).sort({ addedAt: -1 });
  if (promos.length === 0) return ctx.reply('📭 Faol promokod yo‘q!', adminKeyboard);

  let msg = `📋 **Faol promokodlar (${promos.length} ta):**\n\n`;
  promos.forEach((p, i) => {
    const date = new Date(p.addedAt).toLocaleDateString();
    msg += `${i + 1}. \`${p.code}\` — ${date}\n`;
  });
  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: adminKeyboard.reply_markup });
});

bot.hears('👥 Foydalanuvchilar', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return ctx.reply('❌ Faqat admin!', mainKeyboard);
  const total = await User.countDocuments();
  const today = new Date(); today.setHours(0,0,0,0);
  const newToday = await User.countDocuments({ createdAt: { $gte: today } });
  const top = await User.find().sort({ referrals: -1 }).limit(10);

  let msg = `👥 **Foydalanuvchilar**\n\n📊 Jami: ${total} ta\n🆕 Bugun: ${newToday} ta\n\n🏆 **TOP 10 Referal**\n`;
  top.forEach((u, i) => {
    const name = u.firstName || u.username || `ID: ${u.userId}`;
    msg += `${i + 1}. ${name} — ${u.referrals} ta\n`;
  });
  await ctx.reply(msg, adminKeyboard);
});

bot.hears('📊 Bot statistikasi', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return ctx.reply('❌ Faqat admin!', mainKeyboard);
  const [totalUsers, activePromos, totalAdded, todayUsers] = await Promise.all([
    User.countDocuments(),
    PromoCode.countDocuments({ isActive: true }),
    PromoCode.countDocuments(),
    User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } })
  ]);

  const avg = totalUsers > 0 ? (totalAdded / totalUsers).toFixed(2) : 0;

  await ctx.reply(
    `📊 **BOT STATISTIKASI**\n\n` +
    `👥 Foydalanuvchilar:\n   • Jami: ${totalUsers}\n   • Bugun: ${todayUsers}\n\n` +
    `🎁 Promokodlar:\n   • Mavjud: ${activePromos}\n   • Jami qo‘shilgan: ${totalAdded}\n   • O‘rtacha: ${avg}/foydalanuvchi`,
    adminKeyboard
  );
});

// Text handler — promokod qo‘shish
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  if (userStates[userId]?.addingPromo) {
    if (text.toLowerCase() === 'cancel') {
      delete userStates[userId];
      return ctx.reply('❌ Bekor qilindi.', adminKeyboard);
    }

    let code = text.toUpperCase();
    if (text.toLowerCase() === 'auto') code = generatePromoCode();

    if (!code.match(/^[A-Z0-9]{6,20}$/)) {
      return ctx.reply('❌ Faqat katta harf va raqam (6-20 belgi)!\nQayta yozing yoki "cancel"', Markup.keyboard([['auto'], ['cancel']]).resize());
    }

    try {
      await new PromoCode({ code, addedBy: userId }).save();
      delete userStates[userId];
      await ctx.reply(`✅ \`${code}\` muvaffaqiyatli qo‘shildi!`, { parse_mode: 'Markdown', reply_markup: adminKeyboard.reply_markup });
    } catch (err) {
      await ctx.reply('❌ Bu kod allaqachon mavjud!\nBoshqa kiriting yoki "cancel"', Markup.keyboard([['auto'], ['cancel']]).resize());
    }
    return;
  }

  if (!ADMIN_IDS.includes(userId)) {
    await ctx.reply('👇 Faqat tugmalar orqali ishlayman.', mainKeyboard);
  }
});

// Callback — promokod o‘chirish
bot.action(/delete_(.+)/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return ctx.answerCbQuery('❌ Ruxsat yo‘q');
  const code = ctx.match[1];
  const deleted = await PromoCode.findOneAndDelete({ code });
  if (deleted) {
    await ctx.editMessageText(`✅ \`${code}\` o‘chirildi!\n👤 ${ctx.from.first_name}\n📅 ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
  } else {
    await ctx.answerCbQuery('❌ Kod topilmadi');
  }
});

bot.action('cancel_delete', async (ctx) => {
  await ctx.deleteMessage();
  await ctx.answerCbQuery('❌ Bekor qilindi');
});

// Xatoliklar
bot.catch((err, ctx) => {
  console.error('Bot xatosi:', err);
  ctx.reply?.('❌ Xatolik yuz berdi. Keyinroq urinib ko‘ring.');
});

// ================== SERVER VA WEBHOOK ==================

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', bot: 'Bulldrop Promokod Bot', time: new Date().toISOString() });
});

// Webhook
app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body);
  res.status(200).send('OK');
});

// Server ishga tushirish
app.listen(PORT, async () => {
  console.log(`🚀 Server ${PORT} portda ishlayapti`);

  const webhookPath = `${WEBHOOK_URL}/webhook`;
  try {
    await bot.telegram.setWebhook(webhookPath);
    console.log(`✅ Webhook o‘rnatildi: ${webhookPath}`);
  } catch (err) {
    console.error('❌ Webhook xatosi:', err.message);
  }
});
