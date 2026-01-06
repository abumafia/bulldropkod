import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Express server yaratish
const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

// MongoDB ulanish
mongoose.connect('mongodb+srv://abumafia0:abumafia0@abumafia.h1trttg.mongodb.net/bdbot?appName=abumafia')
.then(() => console.log('✅ MongoDB ga ulandi'))
.catch(err => console.error('❌ MongoDB ulanmadi:', err));

// Schemalar
const UserSchema = new mongoose.Schema({
  userId: { type: Number, unique: true },
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
  code: { type: String, unique: true, uppercase: true },
  addedBy: Number,
  addedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

const User = mongoose.model('User', UserSchema);
const PromoCode = mongoose.model('PromoCode', PromoCodeSchema);

// Bot yaratish - polling rejimida
const bot = new Telegraf('8574427558:AAGjdX1vgQijYKDv-UncC2BJN4OU2_MPLRg', {
  telegram: { webhookReply: false }
});

// Admin ID larni o'zingiznikiga almashtiring
const ADMIN_IDS = [6606638731];

// Keyboard menular
const mainKeyboard = Markup.keyboard([
  ['🎁 Kundalik promokod', '👥 Referal havolam'],
  ['📜 Mening promokodlarim', '📊 Statistika']
]).resize();

const adminKeyboard = Markup.keyboard([
  ['➕ Promokod qo\'shish', '🗑️ Promokod o\'chirish'],
  ['📋 Barcha promokodlar', '👥 Foydalanuvchilar'],
  ['📊 Bot statistikasi', '🔙 Asosiy menyu']
]).resize();

// Referal kod generator
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Promokod generator
function generatePromoCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// User yaratish/kontrol qilish
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

// ================== SIMPLE STATE MANAGEMENT ==================
const userStates = {};

// START komandasi
bot.start(async (ctx) => {
  console.log('Start command received from:', ctx.from.id);
  
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
      
      await ctx.reply(`✅ Siz ${referrer.firstName || referrer.username} tomonidan taklif qilindingiz!\n🎁 Endi sizda qo'shimcha promokod olish imkoniyati bor!`);
    }
  }
  
  if (ADMIN_IDS.includes(userId)) {
    await ctx.reply(
      `👋 Admin xush kelibsiz, ${ctx.from.first_name}!\n` +
      `🤖 Bulldrop Promokod Botiga xush kelibsiz!\n\n` +
      `👇 Quyidagi admin panelidan foydalaning:`,
      adminKeyboard
    );
  } else {
    await ctx.reply(
      `👋 Salom ${ctx.from.first_name}!\n` +
      `🎁 Bulldrop Promokod Botiga xush kelibsiz!\n\n` +
      `📌 **Mening ma'lumotlarim:**\n` +
      `👥 Referallar: ${user.referrals} ta\n` +
      `🎁 Promokodlar: ${user.usedPromoCodes.length} ta\n\n` +
      `👇 Quyidagi menyudan tanlang:`,
      mainKeyboard
    );
  }
});

// ================== USER FUNCTIONS ==================

// Kundalik promokod
bot.hears('🎁 Kundalik promokod', async (ctx) => {
  console.log('Kundalik promokod tugmasi bosildi:', ctx.from.id);
  
  const userId = ctx.from.id;
  const user = await User.findOne({ userId });
  
  if (!user) {
    return ctx.reply('❌ Iltimos, botni qayta ishga tushiring (/start)', mainKeyboard);
  }
  
  const now = new Date();
  const lastPromo = user.lastPromoDate;
  
  // 24 soat kutish
  if (lastPromo) {
    const timeDiff = now - lastPromo;
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    if (hoursDiff < 24) {
      const hoursLeft = Math.ceil(24 - hoursDiff);
      return ctx.reply(
        `⏳ Keyingi promokod uchun ${hoursLeft} soat kutishingiz kerak!\n` +
        `👥 Agar tezroq promokod olishni istasangiz, do'stlaringizni taklif qiling!`,
        mainKeyboard
      );
    }
  }
  
  // Promokod olish
  const availablePromo = await PromoCode.findOne({ isActive: true });
  
  if (!availablePromo) {
    return ctx.reply(
      '❌ Hozirda promokodlar tugadi.\n' +
      '📢 Tez orada yangi promokodlar qo\'shiladi!',
      mainKeyboard
    );
  }
  
  // Promokodni berish va yangilash
  user.lastPromoDate = now;
  user.usedPromoCodes.push(availablePromo.code);
  await user.save();
  
  // Promokodni o'chirish
  await PromoCode.findByIdAndDelete(availablePromo._id);
  
  await ctx.reply(
    `🎉 **TABRIKLAYMIZ!**\n\n` +
    `🔑 **Promokodingiz:** \`${availablePromo.code}\`\n\n` +
    `📝 **Eslatma:** Ushbu promokod faqat bir marta ishlatilishi mumkin!\n` +
    `⏳ **Keyingi promokod:** 24 soatdan keyin\n` +
    `👥 **Qo'shimcha promokod:** Har bir taklif qilingan do'st uchun`,
    { parse_mode: 'Markdown', ...mainKeyboard }
  );
});

// Referal havola
bot.hears('👥 Referal havolam', async (ctx) => {
  console.log('Referal havolam tugmasi bosildi:', ctx.from.id);
  
  const userId = ctx.from.id;
  const user = await User.findOne({ userId });
  
  if (!user) {
    return ctx.reply('❌ Iltimos, botni qayta ishga tushiring (/start)', mainKeyboard);
  }
  
  const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.referralCode}`;
  const shareText = `🎁 *Bulldrop Promokod Boti*\n\nHar kuni bepul promokodlar oling!\n👇 Quyidagi havola orqali kirish:`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
  
  await ctx.reply(
    `👥 **Referal havolangiz:**\n\n` +
    `${referralLink}\n\n` +
    `📊 **Statistika:**\n` +
    `✅ Taklif qilingan do'stlar: ${user.referrals} ta\n` +
    `🎁 Qo'shimcha promokodlar: ${user.referrals} ta\n\n` +
    `📌 **Qoidalar:**\n` +
    `• Har bir do'stingiz botga kirganda, sizga 1 ta qo'shimcha promokod beriladi\n` +
    `• Taklif qilingan do'st ham shu tizimdan foydalana oladi`,
    Markup.inlineKeyboard([
      Markup.button.url('📲 Ulashish', shareUrl)
    ]).resize()
  );
});

// Mening promokodlarim
bot.hears('📜 Mening promokodlarim', async (ctx) => {
  console.log('Mening promokodlarim tugmasi bosildi:', ctx.from.id);
  
  const userId = ctx.from.id;
  const user = await User.findOne({ userId });
  
  if (!user) {
    return ctx.reply('❌ Iltimos, botni qayta ishga tushiring (/start)', mainKeyboard);
  }
  
  if (user.usedPromoCodes.length === 0) {
    return ctx.reply(
      '📭 Hozircha sizda promokodlar mavjud emas.\n' +
      '🎁 Birinchi promokodingizni olish uchun "Kundalik promokod" tugmasini bosing!',
      mainKeyboard
    );
  }
  
  const promos = user.usedPromoCodes.slice(-10).reverse();
  let message = `📜 **Sizning oxirgi ${promos.length} ta promokodingiz:**\n\n`;
  
  promos.forEach((code, index) => {
    message += `${index + 1}. \`${code}\`\n`;
  });
  
  message += `\n🎁 Jami: ${user.usedPromoCodes.length} ta promokod`;
  
  await ctx.reply(message, { parse_mode: 'Markdown', ...mainKeyboard });
});

// Statistika
bot.hears('📊 Statistika', async (ctx) => {
  console.log('Statistika tugmasi bosildi:', ctx.from.id);
  
  const userId = ctx.from.id;
  const user = await User.findOne({ userId });
  
  if (!user) {
    return ctx.reply('❌ Iltimos, botni qayta ishga tushiring (/start)', mainKeyboard);
  }
  
  const now = new Date();
  let nextPromoTime = "Hozir olish mumkin";
  
  if (user.lastPromoDate) {
    const nextAvailable = new Date(user.lastPromoDate.getTime() + 24 * 60 * 60 * 1000);
    if (nextAvailable > now) {
      const hoursLeft = Math.ceil((nextAvailable - now) / (1000 * 60 * 60));
      nextPromoTime = `${hoursLeft} soatdan keyin`;
    }
  }
  
  const totalUsers = await User.countDocuments();
  const activePromos = await PromoCode.countDocuments();
  
  await ctx.reply(
    `📊 **SIZNING STATISTIKANGIZ**\n\n` +
    `👤 Ism: ${user.firstName || 'Foydalanuvchi'}\n` +
    `👥 Referallar: ${user.referrals} ta\n` +
    `🎁 Olingan promokodlar: ${user.usedPromoCodes.length} ta\n` +
    `⏳ Keyingi promokod: ${nextPromoTime}\n\n` +
    `📈 **UMUMIY STATISTIKA**\n` +
    `👥 Jami foydalanuvchilar: ${totalUsers} ta\n` +
    `🎁 Mavjud promokodlar: ${activePromos} ta`,
    mainKeyboard
  );
});

// ================== ADMIN FUNCTIONS ==================

// Admin menyu
bot.hears('🔙 Asosiy menyu', async (ctx) => {
  console.log('Admin menyu tugmasi bosildi:', ctx.from.id);
  
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('❌ Bu menyu faqat adminlar uchun!', mainKeyboard);
  }
  
  // State tozalash
  delete userStates[ctx.from.id];
  
  await ctx.reply('👇 Admin menyusi:', adminKeyboard);
});

// Promokod qo'shish
bot.hears('➕ Promokod qo\'shish', async (ctx) => {
  console.log('Promokod qoshish tugmasi bosildi:', ctx.from.id);
  
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('❌ Bu menyu faqat adminlar uchun!', mainKeyboard);
  }
  
  // State o'rnatish
  userStates[ctx.from.id] = { addingPromo: true };
  
  await ctx.reply(
    '📝 Yangi promokod qo\'shish:\n\n' +
    '📌 Avtomatik generatsiya qilish uchun "auto" yozing\n' +
    '📌 O\'zingiz kiritmoqchi bo\'lsangiz, promokodni yozing (6-20 belgi)\n\n' +
    '❌ Bekor qilish uchun "cancel" yozing',
    Markup.keyboard([
      ['auto'],
      ['cancel']
    ]).resize()
  );
});

// Promokod o'chirish
bot.hears('🗑️ Promokod o\'chirish', async (ctx) => {
  console.log('Promokod ochirish tugmasi bosildi:', ctx.from.id);
  
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('❌ Bu menyu faqat adminlar uchun!', mainKeyboard);
  }
  
  // State tozalash
  delete userStates[ctx.from.id];
  
  const promoCodes = await PromoCode.find({ isActive: true }).limit(50);
  
  if (promoCodes.length === 0) {
    return ctx.reply('📭 O\'chirish uchun promokodlar mavjud emas!', adminKeyboard);
  }
  
  let message = '🗑️ **O\'chirish uchun promokodlar:**\n\n';
  const buttons = [];
  
  promoCodes.forEach((promo, index) => {
    message += `${index + 1}. \`${promo.code}\`\n`;
    buttons.push([Markup.button.callback(promo.code, `delete_${promo.code}`)]);
  });
  
  buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_delete')]);
  
  await ctx.reply(
    message + '\n👇 O\'chirmoqchi bo\'lgan promokodingizni tanlang:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    }
  );
});

// Barcha promokodlar
bot.hears('📋 Barcha promokodlar', async (ctx) => {
  console.log('Barcha promokodlar tugmasi bosildi:', ctx.from.id);
  
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('❌ Bu menyu faqat adminlar uchun!', mainKeyboard);
  }
  
  // State tozalash
  delete userStates[ctx.from.id];
  
  const promoCodes = await PromoCode.find({ isActive: true }).sort({ addedAt: -1 });
  const totalCodes = promoCodes.length;
  
  if (totalCodes === 0) {
    return ctx.reply('📭 Hozirda faol promokodlar mavjud emas!', adminKeyboard);
  }
  
  let message = `📋 **Faol promokodlar (${totalCodes} ta):**\n\n`;
  
  promoCodes.forEach((promo, index) => {
    const date = new Date(promo.addedAt).toLocaleDateString();
    message += `${index + 1}. \`${promo.code}\` - 📅 ${date}\n`;
  });
  
  await ctx.reply(message, { parse_mode: 'Markdown', ...adminKeyboard });
});

// Foydalanuvchilar
bot.hears('👥 Foydalanuvchilar', async (ctx) => {
  console.log('Foydalanuvchilar tugmasi bosildi:', ctx.from.id);
  
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('❌ Bu menyu faqat adminlar uchun!', mainKeyboard);
  }
  
  // State tozalash
  delete userStates[ctx.from.id];
  
  const totalUsers = await User.countDocuments();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newUsersToday = await User.countDocuments({ createdAt: { $gte: today } });
  
  const topReferrers = await User.find().sort({ referrals: -1 }).limit(10);
  
  let message = `👥 **Foydalanuvchilar statistikasi**\n\n` +
    `📊 Jami foydalanuvchilar: ${totalUsers} ta\n` +
    `🆕 Bugun qo'shilgan: ${newUsersToday} ta\n\n` +
    `🏆 **TOP 10 Referallar:**\n`;
  
  topReferrers.forEach((user, index) => {
    const name = user.firstName || user.username || `ID: ${user.userId}`;
    message += `${index + 1}. ${name} - ${user.referrals} ta referal\n`;
  });
  
  await ctx.reply(message, adminKeyboard);
});

// Bot statistikasi
bot.hears('📊 Bot statistikasi', async (ctx) => {
  console.log('Bot statistikasi tugmasi bosildi:', ctx.from.id);
  
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('❌ Bu menyu faqat adminlar uchun!', mainKeyboard);
  }
  
  // State tozalash
  delete userStates[ctx.from.id];
  
  const [
    totalUsers,
    activePromos,
    totalPromosAdded,
    todayUsers
  ] = await Promise.all([
    User.countDocuments(),
    PromoCode.countDocuments({ isActive: true }),
    PromoCode.countDocuments(),
    User.countDocuments({ 
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } 
    })
  ]);
  
  const avgPromosPerUser = totalUsers > 0 
    ? (totalPromosAdded / totalUsers).toFixed(2)
    : 0;
  
  await ctx.reply(
    `📊 **BOT STATISTIKASI**\n\n` +
    `👥 Foydalanuvchilar:\n` +
    `   • Jami: ${totalUsers} ta\n` +
    `   • Bugun: ${todayUsers} ta\n\n` +
    `🎁 Promokodlar:\n` +
    `   • Mavjud: ${activePromos} ta\n` +
    `   • Jami qo'shilgan: ${totalPromosAdded} ta\n` +
    `   • O'rtacha: ${avgPromosPerUser} ta/foydalanuvchi\n\n` +
    `📈 **O'rtacha ko'rsatkichlar**\n` +
    `• Har 100 foydalanuvchiga ${totalUsers > 0 ? Math.round(activePromos / totalUsers * 100) : 0} ta promokod`,
    adminKeyboard
  );
});

// ================== PROMOKOD QO'SHISH UCHUN TEXT HANDLER ==================
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  
  console.log('Text message from:', userId, 'text:', text);
  
  // Agar admin promokod qo'shish holatida bo'lsa
  if (userStates[userId] && userStates[userId].addingPromo) {
    if (text.toLowerCase() === 'cancel') {
      delete userStates[userId];
      await ctx.reply('❌ Promokod qo\'shish bekor qilindi.', adminKeyboard);
      return;
    }
    
    let promoCode = text.toUpperCase();
    
    if (text.toLowerCase() === 'auto') {
      promoCode = generatePromoCode();
    }
    
    // Promokod formatini tekshirish
    if (!promoCode.match(/^[A-Z0-9]{6,20}$/)) {
      await ctx.reply(
        '❌ Noto\'g\'ri format!\n' +
        '✅ Promokod faqat katta harflar va raqamlardan iborat bo\'lishi kerak (6-20 belgi)\n' +
        'Qayta kiriting yoki "cancel" deb yozing:',
        Markup.keyboard([
          ['auto'],
          ['cancel']
        ]).resize()
      );
      return;
    }
    
    try {
      const newPromo = new PromoCode({
        code: promoCode,
        addedBy: ctx.from.id
      });
      await newPromo.save();
      
      // State tozalash
      delete userStates[userId];
      
      await ctx.reply(
        `✅ Promokod muvaffaqiyatli qo'shildi!\n\n` +
        `🔑 Kod: \`${promoCode}\`\n` +
        `👤 Qo'shgan: ${ctx.from.first_name}\n` +
        `📅 Sana: ${new Date().toLocaleString()}`,
        { parse_mode: 'Markdown', ...adminKeyboard }
      );
    } catch (error) {
      await ctx.reply(
        '❌ Xatolik: Bu promokod allaqachon mavjud!\n' +
        'Boshqa kod kiriting yoki "cancel" deb yozing:',
        Markup.keyboard([
          ['auto'],
          ['cancel']
        ]).resize()
      );
    }
    return;
  }
  
  // Agar boshqa text bo'lsa, oddiy foydalanuvchiga javob berish
  if (!ADMIN_IDS.includes(userId)) {
    await ctx.reply(
      '🤖 Men faqat quyidagi tugmalar orqali ishlayman:\n' +
      '👇 Pastdagi menyudan tanlang:',
      mainKeyboard
    );
  }
});

// ================== CALLBACK HANDLERS ==================

// Promokod o'chirish callback
bot.action(/delete_(.+)/, async (ctx) => {
  console.log('Delete callback:', ctx.match[1]);
  
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Ruxsat yo\'q!');
  }
  
  const promoCode = ctx.match[1];
  
  try {
    const deleted = await PromoCode.findOneAndDelete({ code: promoCode });
    
    if (deleted) {
      await ctx.editMessageText(
        `✅ Promokod muvaffaqiyatli o'chirildi!\n\n` +
        `🗑️ O'chirildi: \`${promoCode}\`\n` +
        `👤 O'chirgan: ${ctx.from.first_name}\n` +
        `📅 Vaqt: ${new Date().toLocaleString()}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.answerCbQuery('❌ Promokod topilmadi!');
    }
  } catch (error) {
    await ctx.answerCbQuery('❌ Xatolik yuz berdi!');
  }
});

// O'chirishni bekor qilish
bot.action('cancel_delete', async (ctx) => {
  await ctx.deleteMessage();
  await ctx.answerCbQuery('❌ O\'chirish bekor qilindi');
});

// ================== XATOLIKLARNI USHLASH ==================

bot.catch((err, ctx) => {
  console.error(`Bot xatosi [${ctx.updateType}]:`, err);
  console.error('Update:', ctx.update);
  
  try {
    if (ctx.message) {
      ctx.reply('❌ Botda xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.', mainKeyboard);
    }
  } catch (e) {
    console.error('Javob berishda xatolik:', e);
  }
});

// ================== WEB SERVER SETUP ==================

app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Bulldrop Promokod Bot',
    time: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Bot ma'lumotlari
app.get('/botinfo', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activePromos = await PromoCode.countDocuments({ isActive: true });
    
    res.json({
      status: 'running',
      users: totalUsers,
      activePromoCodes: activePromos,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

await bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
console.log('✅ Webhook o‘rnatildi:', `${WEBHOOK_URL}/webhook`);


// Webhook endpoint (agar kerak bo'lsa)
app.post('/webhook', (req, res) => {
  res.status(200).json({ status: 'webhook_not_used' });
});

// Serverni ishga tushirish
async function startServer() {
  const server = app.listen(PORT, async () => {
    console.log(`🚀 Server ${PORT}-portda ishga tushdi`);

    const WEBHOOK_URL = process.env.WEBHOOK_URL;
    await bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);

    console.log('🤖 Webhook ishlayapti:', `${WEBHOOK_URL}/webhook`);
  });
}


// Xatoliklarni ushlash
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('⚠️ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
});

// Serverni ishga tushirish
startServer();
