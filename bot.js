// reaction-bot.js - Auto Reaction Bot
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');

// ==================== KONFIGURATSIYA ====================
const BOT_TOKEN = process.env.BOT_TOKEN || '7412314295:AAHYB804OToAPUQiC-b6Ma6doBtMCHETmQU';
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://abumafia0:abumafia0@abumafia.h1trttg.mongodb.net/st2bot?appName=abumafia';
const ADMIN_IDS = (process.env.ADMIN_IDS || '6606638731').split(',').filter(id => id.trim() !== '').map(id => parseInt(id));
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN || process.env.RENDER_EXTERNAL_URL;
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/webhook';

// Reaksiya emojilar
const REACTIONS = [
    '👍', '👏', '❤️', '🔥', '🎉', '😂', '😮', '😢', '🤔', '👌',
    '🤩', '🥳', '🙌', '💯', '🚀', '⭐', '🏆', '💪', '✨', '🙏'
];

// ==================== MONGOOSE MODELLAR ====================
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB ga ulandi'))
  .catch(err => console.error('❌ MongoDB ulanish xatosi:', err));

const chatSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    chatName: { type: String, required: true },
    chatType: { type: String, enum: ['group', 'supergroup', 'channel'], required: true },
    isActive: { type: Boolean, default: true },
    reactionEmojis: { type: [String], default: REACTIONS },
    reactionCount: { type: Number, default: 1 },
    addedAt: { type: Date, default: Date.now },
    reactionsGiven: { type: Number, default: 0 }
});

const Chat = mongoose.model('Chat', chatSchema);

// ==================== BOT YARATISH ====================
const bot = new Telegraf(BOT_TOKEN);

// Admin tekshiruvi
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

// Tasodifiy reaksiya tanlash
function getRandomReactions(emojis, count = 1) {
    const shuffled = [...emojis].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// Reaksiya bosish funksiyasi
async function addReactions(chatId, messageId, reactionEmojis, reactionCount) {
    try {
        const reactions = getRandomReactions(reactionEmojis, reactionCount);
        
        for (const emoji of reactions) {
            try {
                await bot.telegram.setMessageReaction(chatId, messageId, [
                    { type: 'emoji', emoji: emoji }
                ]);
                
                // Har bir reaksiya orasida biroz kutish
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.log(`Reaksiya qo'shish xatosi: ${error.message}`);
            }
        }
        
        // Statistikani yangilash
        await Chat.updateOne(
            { chatId: chatId.toString() },
            { $inc: { reactionsGiven: reactionCount } }
        );
        
        return true;
    } catch (error) {
        console.error('Reaksiya bosish xatosi:', error.message);
        return false;
    }
}

// ==================== BOT KOMANDALARI ====================
// (Komandalar o'zgarmaydi, oldingi kabi qoladi)

// 1. START KOMANDASI
bot.start(async (ctx) => {
    if (ctx.chat.type === 'private') {
        if (isAdmin(ctx.from.id)) {
            await ctx.replyWithHTML(
                `🤖 <b>Auto Reaction Bot</b>\n\n` +
                `Men har bir yangi xabarga avtomatik reaksiya bosaman!\n\n` +
                `<b>Admin komandalari:</b>\n` +
                `/stats - Bot statistikasi\n` +
                `/chats - Faol chatlar ro'yxati\n` +
                `/addchat - Chat qo'shish\n` +
                `/removechat - Chat olib tashlash\n` +
                `/setreactions - Reaksiyalarni o'zgartirish\n` +
                `/setcount - Reaksiya sonini o'zgartirish\n` +
                `/test - Test reaksiyasi\n` +
                `/help - Yordam\n\n` +
                `<i>Botni guruhingizga yoki kanalingizga qo'shing!</i>`
            );
        } else {
            await ctx.replyWithHTML(
                `🤖 <b>Auto Reaction Bot</b>\n\n` +
                `Men har bir yangi xabarga avtomatik reaksiya bosaman!\n\n` +
                `<i>Botni guruhingizga yoki kanalingizga qo'shing!</i>`
            );
        }
    }
});

// 2. STATISTIKA
bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    try {
        const totalChats = await Chat.countDocuments({ isActive: true });
        const totalReactions = await Chat.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: null, total: { $sum: "$reactionsGiven" } } }
        ]);
        
        await ctx.replyWithHTML(
            `📊 <b>Bot Statistikasi</b>\n\n` +
            `💬 Faol chatlar: <b>${totalChats}</b>\n` +
            `👍 Berilgan reaksiyalar: <b>${totalReactions[0]?.total || 0}</b>\n` +
            `🎯 Reaksiya emojilari: <b>${REACTIONS.length} ta</b>\n\n` +
            `<i>Oxirgi yangilanish: ${new Date().toLocaleString()}</i>`
        );
    } catch (error) {
        await ctx.reply('❌ Statistika olishda xatolik');
    }
});

// 3. CHATLAR RO'YXATI
bot.command('chats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    try {
        const chats = await Chat.find({ isActive: true }).sort({ addedAt: -1 });
        
        if (chats.length === 0) {
            await ctx.reply('📭 Hozircha hech qanday chat yo\'q');
            return;
        }
        
        let message = `📋 <b>Faol Chatlar</b> (${chats.length} ta)\n\n`;
        
        chats.forEach((chat, index) => {
            message += `${index + 1}. <b>${chat.chatName}</b>\n`;
            message += `   🏷️ Turi: ${chat.chatType}\n`;
            message += `   👤 ID: <code>${chat.chatId}</code>\n`;
            message += `   🎯 Reaksiyalar: ${chat.reactionCount} ta\n`;
            message += `   👍 Berilgan: ${chat.reactionsGiven}\n`;
            message += `   📅 Qo'shilgan: ${chat.addedAt.toLocaleDateString()}\n\n`;
        });
        
        await ctx.replyWithHTML(message);
    } catch (error) {
        await ctx.reply('❌ Chatlar ro\'yxatini olishda xatolik');
    }
});

// 4. CHAT QO'SHISH
bot.command('addchat', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const chatId = ctx.message.text.replace('/addchat', '').trim();
    
    if (!chatId) {
        await ctx.reply('❌ Chat ID ni kiriting:\n/addchat <chat_id>');
        return;
    }
    
    try {
        // Chat haqida ma'lumot olish
        const chatInfo = await bot.telegram.getChat(chatId);
        
        // Chatni bazaga qo'shish
        const existingChat = await Chat.findOne({ chatId: chatId.toString() });
        
        if (existingChat) {
            if (existingChat.isActive) {
                await ctx.reply(`✅ Bu chat allaqachon qo'shilgan: ${chatInfo.title}`);
            } else {
                existingChat.isActive = true;
                await existingChat.save();
                await ctx.reply(`✅ Chat qayta faollashtirildi: ${chatInfo.title}`);
            }
        } else {
            const newChat = new Chat({
                chatId: chatId.toString(),
                chatName: chatInfo.title || 'Noma\'lum',
                chatType: chatInfo.type,
                isActive: true
            });
            
            await newChat.save();
            await ctx.reply(`✅ Chat qo'shildi: ${chatInfo.title}\nID: ${chatId}`);
        }
    } catch (error) {
        console.error('Chat qo\'shish xatosi:', error);
        await ctx.reply('❌ Chat qo\'shishda xatolik. Chat ID ni tekshiring.');
    }
});

// 5. CHAT OLIB TASHLASH
bot.command('removechat', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const chatId = ctx.message.text.replace('/removechat', '').trim();
    
    if (!chatId) {
        await ctx.reply('❌ Chat ID ni kiriting:\n/removechat <chat_id>');
        return;
    }
    
    try {
        const chat = await Chat.findOne({ chatId: chatId.toString() });
        
        if (!chat) {
            await ctx.reply('❌ Bunday chat topilmadi');
            return;
        }
        
        chat.isActive = false;
        await chat.save();
        
        await ctx.reply(`✅ Chat o'chirib qo'yildi: ${chat.chatName}`);
    } catch (error) {
        await ctx.reply('❌ Chat olib tashlashda xatolik');
    }
});

// 6. REAKSIYALARNI O'ZGARTIRISH
bot.command('setreactions', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const text = ctx.message.text.replace('/setreactions', '').trim();
    
    if (!text) {
        await ctx.reply(
            '❌ Reaksiya emojilarini kiriting:\n' +
            '/setreactions 👍 ❤️ 😂 👏 🔥\n\n' +
            `Joriy reaksiyalar: ${REACTIONS.join(' ')}`
        );
        return;
    }
    
    const newReactions = text.split(' ').filter(emoji => emoji.trim() !== '');
    
    if (newReactions.length === 0) {
        await ctx.reply('❌ Kamida bitta emoji kiriting');
        return;
    }
    
    // Global reaksiyalarni yangilash (faqat joriy session uchun)
    REACTIONS.length = 0;
    REACTIONS.push(...newReactions);
    
    await ctx.reply(
        `✅ Reaksiyalar yangilandi!\n\n` +
        `Yangi reaksiyalar: ${newReactions.join(' ')}\n` +
        `Jami: ${newReactions.length} ta emoji`
    );
});

// 7. REAKSIYA SONINI O'ZGARTIRISH
bot.command('setcount', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const count = parseInt(ctx.message.text.replace('/setcount', '').trim());
    
    if (isNaN(count) || count < 1 || count > 10) {
        await ctx.reply('❌ 1 dan 10 gacha son kiriting:\n/setcount 3');
        return;
    }
    
    try {
        // Barcha faol chatlar uchun reaksiya sonini yangilash
        await Chat.updateMany(
            { isActive: true },
            { reactionCount: count }
        );
        
        await ctx.reply(`✅ Reaksiya soni ${count} ga o'zgartirildi`);
    } catch (error) {
        await ctx.reply('❌ Reaksiya sonini o\'zgartirishda xatolik');
    }
});

// 8. TEST REAKSIYASI
bot.command('test', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    try {
        // Joriy xabarga test reaksiyasi
        const success = await addReactions(
            ctx.chat.id,
            ctx.message.message_id,
            REACTIONS,
            3
        );
        
        if (success) {
            await ctx.reply('✅ Test reaksiyasi muvaffaqiyatli!');
        } else {
            await ctx.reply('❌ Test reaksiyasi muvaffaqiyatsiz');
        }
    } catch (error) {
        await ctx.reply('❌ Test reaksiyasi xatosi');
    }
});

// 9. YORDAM
bot.command('help', async (ctx) => {
    if (isAdmin(ctx.from.id)) {
        await ctx.replyWithHTML(
            `🆘 <b>Admin Yordam</b>\n\n` +
            `<b>Asosiy komandalar:</b>\n` +
            `/stats - Bot statistikasi\n` +
            `/chats - Faol chatlar ro'yxati\n` +
            `/addchat <id> - Chat qo'shish\n` +
            `/removechat <id> - Chat olib tashlash\n` +
            `/setreactions <emojilar> - Reaksiyalarni o'zgartirish\n` +
            `/setcount <son> - Reaksiya sonini o'zgartirish\n` +
            `/test - Test reaksiyasi\n` +
            `/help - Yordam\n\n` +
            `<b>Chat ID ni olish:</b>\n` +
            `1. Botni chatga qo'shing\n` +
            `2. Chatda /id komandasini yuboring\n\n` +
            `<i>Admin ID: ${ctx.from.id}</i>`
        );
    } else {
        await ctx.replyWithHTML(
            `🤖 <b>Auto Reaction Bot</b>\n\n` +
            `Men har bir yangi xabarga avtomatik reaksiya bosaman!\n\n` +
            `Botni guruhingizga yoki kanalingizga qo'shing!\n\n` +
            `Foydalanish uchun admin bilan bog'laning.`
        );
    }
});

// 10. CHAT ID NI OLISH
bot.command('id', async (ctx) => {
    if (ctx.chat.type !== 'private') {
        await ctx.reply(`Chat ID: <code>${ctx.chat.id}</code>`, { parse_mode: 'HTML' });
    } else {
        await ctx.reply(`Sizning ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' });
    }
});

// ==================== ASOSIY FUNKSIYALAR ====================

// 1. BOT CHATGA QO'SHILGANDA
bot.on('new_chat_members', async (ctx) => {
    if (ctx.message.new_chat_members.some(member => member.id === ctx.botInfo.id)) {
        try {
            const chatId = ctx.chat.id.toString();
            const existingChat = await Chat.findOne({ chatId });
            
            if (existingChat) {
                if (!existingChat.isActive) {
                    existingChat.isActive = true;
                    await existingChat.save();
                }
            } else {
                const newChat = new Chat({
                    chatId: chatId,
                    chatName: ctx.chat.title || 'Noma\'lum',
                    chatType: ctx.chat.type,
                    isActive: true
                });
                
                await newChat.save();
            }
            
            await ctx.replyWithHTML(
                `🤖 <b>Auto Reaction Bot</b>\n\n` +
                `Men har bir yangi xabarga avtomatik reaksiya bosaman!\n\n` +
                `<i>Botni to'liq ishlashi uchun "reaksiya qo'shish" huquqini bering.</i>\n\n` +
                `📝 Chat ID: <code>${chatId}</code>\n` +
                `🔧 Admin uchun: /addchat ${chatId}`
            );
            
        } catch (error) {
            console.error('Bot qo\'shilish xatosi:', error);
        }
    }
});

// 2. YANGI XABARLARGA REAKSIYA
bot.on('message', async (ctx) => {
    try {
        // Faqat guruh va kanallarda ishlaydi
        if (ctx.chat.type === 'private') return;
        
        // O'z xabarlariga reaksiya bosmaydi
        if (ctx.from && ctx.from.id === ctx.botInfo.id) return;
        
        // Sistem xabarlariga reaksiya bosmaydi
        if (ctx.message.new_chat_members || ctx.message.left_chat_member) return;
        
        const chatId = ctx.chat.id.toString();
        const chat = await Chat.findOne({ chatId, isActive: true });
        
        if (!chat) return;
        
        // Reaksiya bosish
        setTimeout(async () => {
            try {
                await addReactions(
                    chatId,
                    ctx.message.message_id,
                    chat.reactionEmojis.length > 0 ? chat.reactionEmojis : REACTIONS,
                    chat.reactionCount || 1
                );
            } catch (error) {
                console.log('Reaksiya bosish xatosi:', error.message);
            }
        }, 1000); // 1 soniya kutib, keyin reaksiya
        
    } catch (error) {
        console.error('Xabarni qayta ishlash xatosi:', error.message);
    }
});

// 3. KANAL POSTLARIGA REAKSIYA
bot.on('channel_post', async (ctx) => {
    try {
        const chatId = ctx.chat.id.toString();
        const chat = await Chat.findOne({ chatId, isActive: true });
        
        if (!chat) return;
        
        // Reaksiya bosish
        setTimeout(async () => {
            try {
                await addReactions(
                    chatId,
                    ctx.channelPost.message_id,
                    chat.reactionEmojis.length > 0 ? chat.reactionEmojis : REACTIONS,
                    chat.reactionCount || 1
                );
            } catch (error) {
                console.log('Kanal postiga reaksiya xatosi:', error.message);
            }
        }, 1000);
        
    } catch (error) {
        console.error('Kanal postini qayta ishlash xatosi:', error.message);
    }
});

// 4. BOT CHATDAN CHIQQANDA
bot.on('left_chat_member', async (ctx) => {
    if (ctx.message.left_chat_member.id === ctx.botInfo.id) {
        try {
            await Chat.updateOne(
                { chatId: ctx.chat.id.toString() },
                { isActive: false }
            );
        } catch (error) {
            console.error('Chatni o\'chirish xatosi:', error);
        }
    }
});

// ==================== WEBHOOK SOZLASH ====================

const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Webhook endpoint
app.post(WEBHOOK_PATH, (req, res) => {
    bot.handleUpdate(req.body, res).then(() => {
        // Agar bot.handleUpdate promise resolve bo'lsa
        // Telegraf avtomatik ravishda res.end() qiladi
    }).catch((err) => {
        console.error('Webhook error:', err);
        res.status(500).send('Internal Server Error');
    });
});

// Sog'lomlik tekshiruvi
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        service: 'Telegram Auto Reaction Bot',
        webhook: WEBHOOK_DOMAIN ? `${WEBHOOK_DOMAIN}${WEBHOOK_PATH}` : 'Not configured',
        timestamp: new Date().toISOString()
    });
});

// Asosiy sahifa
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Auto Reaction Bot</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                h1 { color: #333; }
                .status { 
                    background: #4CAF50; 
                    color: white; 
                    padding: 10px 20px; 
                    border-radius: 5px;
                    display: inline-block;
                }
            </style>
        </head>
        <body>
            <h1>🤖 Auto Reaction Bot</h1>
            <p>Telegram guruplari va kanallari uchun avtomatik reaksiya boti</p>
            <div class="status">✅ Bot ishlamoqda</div>
            <p><small>Server vaqti: ${new Date().toLocaleString()}</small></p>
        </body>
        </html>
    `);
});

// ==================== BOTNI ISHGA TUSHIRISH ====================

async function startBot() {
    try {
        console.log('🚀 Bot ishga tushmoqda...');
        
        // Bot ma'lumotlarini olish
        const botInfo = await bot.telegram.getMe();
        console.log(`🤖 Bot: @${botInfo.username}`);
        console.log(`👑 Adminlar: ${ADMIN_IDS.join(', ') || 'yo\'q'}`);
        console.log(`🎯 Reaksiyalar: ${REACTIONS.length} ta`);
        
        // Webhook sozlash (agar WEBHOOK_DOMAIN mavjud bo'lsa)
        if (WEBHOOK_DOMAIN) {
            const webhookUrl = `${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
            console.log(`🌐 Webhook URL: ${webhookUrl}`);
            
            // Avval webhookni o'chirish
            await bot.telegram.deleteWebhook({ drop_pending_updates: true });
            
            // Yangi webhook o'rnatish
            await bot.telegram.setWebhook(webhookUrl);
            
            console.log('✅ Webhook muvaffaqiyatli o\'rnatildi');
        } else {
            console.log('⚠️  Webhook domain berilmagan. Polling rejimida ishlayman.');
            // Agar webhook domain berilmagan bo'lsa, polling rejimida ishlash
            await bot.launch();
            console.log('✅ Bot polling rejimida ishga tushdi');
        }
        
        // Server portini eshitish
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`✅ Server ${PORT} portida ishga tushdi`);
            console.log('📋 Health check: /health');
            console.log('🏠 Asosiy sahifa: /');
            console.log('\n🎉 Bot tayyor!');
        });
        
    } catch (error) {
        console.error('❌ Botni ishga tushirishda xatolik:', error);
        process.exit(1);
    }
}

// Error handling
bot.catch((err, ctx) => {
    console.error(`Bot xatosi: ${err.message}`);
    if (ctx) {
        console.error(`Chat ID: ${ctx.chat?.id}, User ID: ${ctx.from?.id}`);
    }
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('\n🔄 Bot to\'xtayapti...');
    bot.stop();
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('\n🔄 Bot to\'xtayapti...');
    bot.stop();
    process.exit(0);
});

// Botni ishga tushirish
startBot();