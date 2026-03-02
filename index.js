require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// ---------------- CLIENT ----------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---------------- REWARDS ----------------
const rewards = [
  { name: "Consolation Prize", coins: 20, weight: 40, emoji: "🎁" },
  { name: "Small Win", coins: 50, weight: 30, emoji: "💵" },
  { name: "Big Win", coins: 200, weight: 20, emoji: "💰" },
  { name: "Jackpot", coins: 1000, weight: 10, emoji: "🎉" },
  { name: "Wallpaper from a Goddess", coins: 0, weight: 5, emoji: "🖼️" },
  { name: "10 Slaps", coins: 0, weight: 25, emoji: "👋" },
  { name: "5 Edges", coins: 0, weight: 10, emoji: "🪓" },
  { name: "Write Worship Post for a Goddess", coins: 0, weight: 15, emoji: "✍️" },
  { name: "Bad Luck", coins: 0, weight: 8.5, emoji: "☠️" },
  { name: "MEGA JACKPOT", coins: 1000000, weight: 0.1, emoji: "🏆" }
];

// ---------------- COOLDOWNS ----------------
// Map key format: `${userId}-${guildId}`
const cooldowns = new Map();

// ---------------- HELPER FUNCTIONS ----------------
function getRandomReward() {
  const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
  const random = Math.random() * totalWeight;
  let currentWeight = 0;
  for (const reward of rewards) {
    currentWeight += reward.weight;
    if (random < currentWeight) return reward;
  }
}

async function addMoney(guildId, userId, coins) {
  if (coins <= 0) return;
  try {
    await axios.patch(
      `https://unbelievaboat.com/api/v1/guilds/${guildId}/users/${userId}`,
      { cash: coins },
      { headers: { Authorization: process.env.UB_API_KEY } }
    );
  } catch (error) {
    console.error("Failed to add money:", error.response?.data || error.message);
  }
}

// ---------------- REGISTER SLASH COMMAND ----------------
const commands = [
  new SlashCommandBuilder()
    .setName('spin')
    .setDescription('Spin the lucky wheel!')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    // Global command for all servers
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("Global slash command registered.");
  } catch (error) {
    console.error(error);
  }
})();

// ---------------- SPIN INTERACTION ----------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'spin') return;

  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const cooldownKey = `${userId}-${guildId}`;
  const now = Date.now();

  try {
    // ---------------- COOLDOWN ----------------
    if (cooldowns.has(cooldownKey)) {
      const expiration = cooldowns.get(cooldownKey);
      if (now < expiration) {
        const remaining = Math.ceil((expiration - now) / 60000);
        return interaction.reply({ content: `⏳ You need to wait ${remaining} more minute(s) before spinning again in this server.`, ephemeral: true });
      }
    }
    cooldowns.set(cooldownKey, now + 30 * 60 * 1000); // 30 min cooldown

    // ---------------- INITIAL REPLY ----------------
    await interaction.reply({ content: "🎡 Spinning the wheel...", ephemeral: false });

    // ---------------- PICK FINAL REWARD ----------------
    const finalReward = getRandomReward();
    const finalIndex = rewards.findIndex(r => r.name === finalReward.name);

    // ---------------- SPIN PREVIEW ----------------
    const spinRounds = 15;
    for (let i = 0; i < spinRounds; i++) {
      const index = (i + finalIndex) % rewards.length;

      const embed = new EmbedBuilder()
        .setTitle("🎡 Spinning the wheel...")
        .setDescription(
          rewards.map((r, idx) => {
            if (idx === index) return `👉 **${r.emoji} ${r.name}**`;
            if ((idx + 1) % rewards.length === index) return `${r.emoji} ${r.name}`; // previous
            if ((idx - 1 + rewards.length) % rewards.length === index) return `${r.emoji} ${r.name}`; // next
            return `${r.emoji} ${r.name}`;
          }).join("\n")
        )
        .setColor("#FFD700");

      await interaction.editReply({ embeds: [embed] });
      await new Promise(r => setTimeout(r, 400 + i * 20));
    }

    // ---------------- ADD COINS ----------------
    await addMoney(guildId, userId, finalReward.coins);

    // ---------------- FINAL RESULT ----------------
    const finalEmbed = new EmbedBuilder()
      .setTitle("🎉 Congratulations!!")
      .setDescription(
        `▌ ${finalReward.emoji} **${finalReward.name}** – ${finalReward.coins > 0 ? `${finalReward.coins} coins` : "non-monetary reward"}\n` +
        `🏅 Winner: <@${userId}>\n` +
        `⏱️ Next spin available in 30 minutes`
      )
      .setColor("#00FF00");

    await interaction.editReply({ embeds: [finalEmbed] });

  } catch (err) {
    console.error("Spin error:", err);
    if (!interaction.replied) {
      await interaction.reply({ content: "❌ Something went wrong with your spin!", ephemeral: true });
    }
  }
});

client.login(process.env.TOKEN);