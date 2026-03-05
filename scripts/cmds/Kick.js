const nix = {
  name: "kick",
  version: "1.0",
  aliases: [],
  description: "Expulser un utilisateur du groupe",
  author: "Christus",
  prefix: true,
  category: "moderation",
  role: 1,
  cooldown: 0,
  guide: "{p}kick en réponse à un message\n{p}kick @utilisateur [raison]"
};

async function onStart({ bot, message, msg, chatId, args, usages }) {
  try {
    const userId = msg.from.id;

    const chatMember = await bot.getChatMember(chatId, userId);
    if (chatMember.status !== 'creator' && chatMember.status !== 'administrator') {
      return bot.sendMessage(chatId, "❌ Vous devez être administrateur pour utiliser cette commande.", 
        { reply_to_message_id: msg.message_id });
    }

    let targetUserId, reason;

    if (msg.reply_to_message) {
      targetUserId = msg.reply_to_message.from.id;
      reason = args.join(' ') || 'Aucune raison fournie';
    } else if (args.length > 0) {
      const username = args[0].replace('@', '');
      const chatMember = await bot.getChatMember(chatId, username);
      if (!chatMember) {
        return bot.sendMessage(chatId, "Utilisateur introuvable.", 
          { reply_to_message_id: msg.message_id });
      }
      targetUserId = chatMember.user.id;
      reason = args.slice(1).join(' ') || 'Aucune raison fournie';
    } else {
      return bot.sendMessage(chatId, "Veuillez répondre à un message ou fournir un nom d'utilisateur à expulser.", 
        { reply_to_message_id: msg.message_id });
    }

    if (targetUserId === userId) {
      return bot.sendMessage(chatId, "Vous ne pouvez pas vous expulser vous-même.", 
        { reply_to_message_id: msg.message_id });
    }

    await bot.kickChatMember(chatId, targetUserId);
    await bot.unbanChatMember(chatId, targetUserId);

    await bot.sendMessage(chatId, 
      `✅ Utilisateur expulsé.\nRaison : ${reason}`,
      { reply_to_message_id: msg.message_id }
    );

  } catch (error) {
    console.error("Erreur dans la commande kick :", error);
    await bot.sendMessage(msg.chat.id, 
      "❌ Une erreur s'est produite lors de l'expulsion.", 
      { reply_to_message_id: msg.message_id }
    );
  }
}

module.exports = { onStart, nix };
