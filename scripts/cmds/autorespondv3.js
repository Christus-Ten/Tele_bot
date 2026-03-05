const nix = {
  name: 'autorespondv3',
  version: '1.4',
  aliases: [],
  description: 'Réagit automatiquement avec des emojis et réponses',
  author: 'Aesther (converted)',
  prefix: false, // Cette commande ne nécessite pas de préfixe, elle écoute tous les messages
  category: 'fun',
  role: 0,
  cooldown: 5,
  guide: 'Cette commande fonctionne automatiquement en arrière-plan.'
};

// Dictionnaire des mots-clés et emojis associés
const emojis = {
  '💜': ['cliff', 'august', 'jonell', 'david', 'purple', 'fritz', 'sab', 'haru', 'xuazane', 'kim'],
  '💚': ['dia', 'seyj', 'ginanun', 'gaganunin', 'pfft', 'xyrene', 'gumanun'],
  '😾': ['jo', 'ariii', 'talong', 'galit'],
  '😼': ['wtf', 'fck', 'haaays', 'naku', 'ngi ', 'ngek', 'nge ', 'luh', 'lah'],
  '😸': ['pill', 'laugh', 'lt ', 'gagi', 'huy', 'hoy'],
  '🌀': ['prodia', 'sdxl', 'bardv3', 'tanongv2', '-imagine', 'genimg', 'tanongv4', 'kamla', '-shortcut', 'imagine', 'textpro', 'photofy'],
  '👋': ['hi ', 'hello', 'salut', 'bjr', 'bonjour', 'bonsoir', 'slt'],
  '🔥': ['astig', 'damn', 'angas', 'galing', 'husay', '.jpg'],
  '💩': ['merde', 'caca', 'shit'],
  '🤢': ['beurk', 'dégueulasse', 'dégeu', 'horrible', 'vomir'],
  '🌸': ['amour', 'câlin', 'tendresse', 'gentillesse', 'bienveillance', 'douceur', 'complicité', 'gratitude', 'bonheur', 'amitié'],
  '😂': ['ridicule', 'clownesque', 'farce', 'pitrerie', 'comique', 'drôle', 'amusant', 'hilarant', 'loufoque', 'bouffonnerie', 'cocasse', 'burlesque', 'rigolo', 'absurde', 'irrévérencieux', 'ironique', 'parodie', 'esprit', 'facétieux'],
  '😎': ['cool', 'formidable', '😎'],
  '⚡': ['super', 'aesther'],
  '🤖': ['prefix', 'robot'],
  '🔰': ['nathan', 'cyble', 'barro', 'personnage'],
  '✔️': ['bien', 'ok'],
  '🎉': ['congrats', 'félicitation', 'goddess-anaïs'],
  '📑': ['disertation', 'liste', 'document', 'playlist', 'count all'],
  '♻️': ['restart', 'revoila'],
  '🖕': ['fuck', 'enculer', 'fdp', '🖕'],
  '🔖': ['cmd', 'command'],
  '😑': ['mmmh', 'kiii', 'hum'],
  '💍': ['aesther'],
  '💵': ['anjara', 'money', 'argent', 'ariary'],
  '😝': ['anjara'],
  '✨': ['oui', 'super'],
  '✖️': ['wrong', 'faux'],
  '🎮': ['gaming', 'jeux', 'playing', 'jouer'],
  '🤡': ['kindly provide the question', 'clone', 'sanchokuin', 'bakugo'],
  '💙': ['manga', 'anime', 'sukuna'],
  '😕': ['bruh'],
  '👎': ['kindly provide'],
  '🌩️': ['*thea', 'tatakae', 'damare'],
  '😈': ['malin', 'devil', 'evil', 'suprem', 'sadique'],
  '🔪': ['tué']
};

// Dictionnaire des déclencheurs pour réponses textuelles
const replies = {
  '🌷🌷🌷': '~~𝙾𝚞𝚒 ?? 🙃🌷'
};

async function onStart({ bot, message, msg, chatId, args }) {
  // Cette commande ne fait rien lorsqu'elle est invoquée directement.
  // On peut éventuellement informer l'utilisateur qu'elle est active.
  await bot.sendMessage(
    chatId,
    '✅ L\'autorespondeur est actif. Il réagira automatiquement aux messages.',
    { reply_to_message_id: msg?.message_id }
  );
}

async function onChat({ bot, message, msg }) {
  // Ignorer les messages vides
  if (!msg.text) return;

  const text = msg.text.toLowerCase();
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  // Vérifier les réactions emoji
  for (const [emoji, words] of Object.entries(emojis)) {
    for (const word of words) {
      if (text.includes(word)) {
        // Ajouter la réaction au message
        try {
          await bot.setMessageReaction(chatId, messageId, emoji);
        } catch (err) {
          console.error('Erreur lors de l\'ajout de la réaction :', err);
        }
        return; // Une seule réaction par message
      }
    }
  }

  // Vérifier les réponses textuelles
  for (const [trigger, replyText] of Object.entries(replies)) {
    if (text.includes(trigger)) {
      try {
        await bot.sendMessage(chatId, replyText, { reply_to_message_id: messageId });
      } catch (err) {
        console.error('Erreur lors de l\'envoi de la réponse :', err);
      }
      return; // Une seule réponse par message
    }
  }
}

module.exports = { onStart, onChat, nix };
