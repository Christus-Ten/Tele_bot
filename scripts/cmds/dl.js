const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Helper to get API base URL (unused here but kept for consistency)
async function getBaseApiUrl() {
  return 'https://www.noobs-api.rf.gd/dipto';
}

// Regex patterns for supported platforms
const patterns = {
  y: /(youtube\.com|youtu\.be)/i,
  s: /(spotify\.com|spotify\.link)/i,
  i: /(imgur\.com|i\.imgur\.com)/i,
  p: /(pinterest\.com|pin\.it)/i,
  b: /(imgbb\.com|ibb\.co)/i
};

function classifyUrl(url) {
  return {
    y: patterns.y.test(url),
    s: patterns.s.test(url),
    i: patterns.i.test(url) || patterns.p.test(url) || patterns.b.test(url)
  };
}

async function handleDownload(bot, msg, url) {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  // Send "processing" message
  let waitMsg;
  try {
    waitMsg = await bot.sendMessage(chatId, '⏳ Processing your request...', {
      reply_to_message_id: messageId
    });
  } catch (e) {
    console.error('Failed to send processing message:', e);
    return;
  }
  const waitMsgId = waitMsg.message_id;

  let apiResponse;
  try {
    apiResponse = await axios.get(
      `https://downvid.onrender.com/api/download?url=${encodeURIComponent(url)}`,
      { timeout: 60000 }
    );
  } catch (error) {
    await bot.deleteMessage(chatId, waitMsgId).catch(() => {});
    await bot.sendMessage(chatId, `❎ Error: Failed to fetch from API`, {
      reply_to_message_id: messageId
    }).catch(() => {});
    return;
  }

  const data = apiResponse?.data;
  if (!data || data.status !== 'success') {
    await bot.deleteMessage(chatId, waitMsgId).catch(() => {});
    await bot.sendMessage(chatId, `❎ Error: Invalid API response`, {
      reply_to_message_id: messageId
    }).catch(() => {});
    return;
  }

  // Extract media URLs
  const meta = data?.data?.data || {};
  const videoUrl = data.video || meta.nowm || null;
  const audioUrl = data.audio || null;
  const imageUrl = data.image || meta.image || null;

  const classification = classifyUrl(url);
  let mediaItems = [];
  let caption = '✅ Downloaded\n\n';

  if (classification.s) {
    if (!audioUrl) {
      await bot.deleteMessage(chatId, waitMsgId).catch(() => {});
      await bot.sendMessage(chatId, `❎ Error: No audio found`, {
        reply_to_message_id: messageId
      }).catch(() => {});
      return;
    }
    mediaItems.push({ url: audioUrl, type: 'a' });
    caption = '✅ Spotify Audio 🎧\n\n';
  } else if (classification.y) {
    if (!videoUrl) {
      await bot.deleteMessage(chatId, waitMsgId).catch(() => {});
      await bot.sendMessage(chatId, `❎ Error: No video found`, {
        reply_to_message_id: messageId
      }).catch(() => {});
      return;
    }
    mediaItems.push({ url: videoUrl, type: 'v' });
    caption = '✅ YouTube Video 🎬\n\n';
  } else if (classification.i) {
    if (!imageUrl && !videoUrl) {
      await bot.deleteMessage(chatId, waitMsgId).catch(() => {});
      await bot.sendMessage(chatId, `❎ Error: No image or video found`, {
        reply_to_message_id: messageId
      }).catch(() => {});
      return;
    }
    mediaItems.push({ url: imageUrl || videoUrl, type: imageUrl ? 'i' : 'v' });
    caption = '✅ Image 🖼️\n\n';
  } else {
    // Generic: try video, audio, image in order
    if (videoUrl) mediaItems.push({ url: videoUrl, type: 'v' });
    else if (audioUrl) mediaItems.push({ url: audioUrl, type: 'a' });
    else if (imageUrl) mediaItems.push({ url: imageUrl, type: 'i' });
    else {
      await bot.deleteMessage(chatId, waitMsgId).catch(() => {});
      await bot.sendMessage(chatId, `❎ Error: No downloadable media found`, {
        reply_to_message_id: messageId
      }).catch(() => {});
      return;
    }
  }

  // Ensure cache directory exists
  const cacheDir = path.join(__dirname, 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const downloadedFiles = [];
  const filePaths = [];

  try {
    for (const item of mediaItems) {
      const ext = item.type === 'a' ? 'mp3' : item.type === 'i' ? 'jpg' : 'mp4';
      const filePath = path.join(cacheDir, `autodl_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`);

      const response = await axios.get(item.url, {
        responseType: 'arraybuffer',
        timeout: 120000
      });

      fs.writeFileSync(filePath, Buffer.from(response.data));
      filePaths.push(filePath);

      // Determine Telegram media type
      let telegramType;
      if (item.type === 'a') telegramType = 'audio';
      else if (item.type === 'i') telegramType = 'photo';
      else telegramType = 'video';

      downloadedFiles.push({
        type: telegramType,
        media: filePath  // path string works with sendMediaGroup
      });
    }

    // Add caption to the first media
    if (downloadedFiles.length > 0) {
      downloadedFiles[0].caption = `${caption}📌 ${meta.title || 'Media'}`;
    }

    // Send media group
    await bot.sendMediaGroup(chatId, downloadedFiles, {
      reply_to_message_id: messageId
    });

    // Delete processing message
    await bot.deleteMessage(chatId, waitMsgId).catch(() => {});

    // Clean up files
    filePaths.forEach(p => {
      try { fs.unlinkSync(p); } catch (e) {}
    });
  } catch (error) {
    console.error('Download/send error:', error);
    // Clean up files
    filePaths.forEach(p => {
      try { fs.unlinkSync(p); } catch (e) {}
    });
    await bot.deleteMessage(chatId, waitMsgId).catch(() => {});
    await bot.sendMessage(chatId, `❎ Error: ${error.message}`, {
      reply_to_message_id: messageId
    }).catch(() => {});
  }
}

const nix = {
  name: 'autodl',
  version: '3.4.0',
  aliases: [],
  description: 'Auto download video/audio/image from YouTube, Spotify, Imgur, Pinterest, ImgBB and more',
  author: 'Christus',
  prefix: false, // listens to all messages
  category: 'media',
  role: 0,
  cooldown: 0,
  guide: 'Just send a supported link (YouTube, Spotify, Imgur, Pinterest, ImgBB, etc.) and the bot will download the media automatically. You can also use /autodl <url>'
};

async function onStart({ bot, msg, chatId, args }) {
  const url = args.join(' ').match(/https?:\/\/\S+/i)?.[0];
  if (!url) {
    // Show info if no URL provided
    await bot.sendMessage(
      chatId,
      '🔍 *Auto Downloader Active*\n\nSend me a link from YouTube, Spotify, Imgur, Pinterest, ImgBB, etc., and I will download the media for you.\n\nYou can also use `/autodl <url>`',
      {
        parse_mode: 'Markdown',
        reply_to_message_id: msg?.message_id
      }
    );
    return;
  }
  await handleDownload(bot, msg, url);
}

async function onChat({ bot, msg }) {
  const url = msg.text?.match(/https?:\/\/\S+/i)?.[0];
  if (!url) return;
  await handleDownload(bot, msg, url);
}

module.exports = { onStart, onChat, nix };
