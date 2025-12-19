const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { error } = require('../utils/Console');

class BattleSession {
  constructor(client, threadId, players = [], adminId) {
    this.client = client;
    this.threadId = threadId;
    this.adminId = adminId;
    // players: array of { id, username }
    this.players = players.map(p => ({ id: p.id, username: p.username, hp: 100 }));
    this.turn = 0; // index in players
    this.log = [];
    this.busy = false;
    this.armies = null; // will be set by admin: { attacker: [t1,t2,t3,t4], defender: [...] }
  }

  async _getChannel() {
    return this.client.channels.fetch(this.threadId);
  }

  _opponentIndex(index) {
    return (index + 1) % this.players.length;
  }

  _findPlayerIndexById(id) {
    return this.players.findIndex(p => p.id === id);
  }

  async sendUpdate(content, options) {
    const ch = await this._getChannel();
    if (!ch) return null;
    return ch.send({ content, ...options });
  }

  async start() {
    // If armies not configured, ask the admin to provide counts in the thread.
    if (!this.armies) {
      const adminMention = `<@${this.adminId}>`;
      const instructions = `${adminMention}, please set up the armies by replying in this thread with the following format:\n` +
        "setup attacker: t1,t2,t3,t4 ; defender: t1,t2,t3,t4\n" +
        "Example: setup attacker: 3,1,0,0 ; defender: 2,2,0,0";
      await this.sendUpdate(instructions);
      return;
    }

    // armies configured: send control buttons and initial battle message
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle:attack').setLabel('Attack').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('battle:retreat').setLabel('Retreat').setStyle(ButtonStyle.Secondary)
    );

    await this.sendUpdate(
      `Battle started between ${this.players.map(p => p.username).join(' and ')}. It's ${this.players[this.turn].username}'s turn.`,
      { components: [row] }
    );
  }

  async handleInteraction(interaction) {
    try {
      if (!interaction.isButton()) return;
      // customId format: 'battle:action'
      const [ns, action] = interaction.customId.split(':');
      if (ns !== 'battle') return;

      const userId = interaction.user.id;
      const actorIndex = this._findPlayerIndexById(userId);
      if (actorIndex === -1) {
        await interaction.reply({ content: 'You are not a participant in this battle.', ephemeral: true });
        return;
      }

      // simple turn enforcement (attack requires actor's turn)
      if (actorIndex !== this.turn) {
        await interaction.reply({ content: `It's not your turn. It's ${this.players[this.turn].username}'s turn.`, ephemeral: true });
        return;
      }

      await interaction.deferUpdate();

      if (action === 'attack') {
        await this._actionAttack(actorIndex);
      } else if (action === 'retreat') {
        await this._actionRetreat(actorIndex);
      }
    } catch (err) {
      error('BattleSession handleInteraction error', err);
    }
  }

  async handleMessage(message) {
    // allow simple text commands in the thread like '!attack' or 'setup ...' from admin
    const content = message.content.trim().toLowerCase();
    const authorId = message.author.id;

    // Admin setup command
    if (content.startsWith('setup')) {

      if(this.adminId && authorId !== this.adminId) {
        await message.reply('Only the battle admin can configure the armies setup.');
        return;
      }

      // parse setup: expected format: setup attacker: a1,a2,a3,a4 ; defender: d1,d2,d3,d4
      const rest = content.slice('setup'.length).trim();
      try {

        const parts = rest.split(';').map(s => s.trim());
        const attackerPart = parts.find(p => p.startsWith('attacker'));
        const defenderPart = parts.find(p => p.startsWith('defender'));
        if (!attackerPart || !defenderPart) {
          await message.reply('Invalid setup format. See example in the setup prompt.');
          return;
        }
        const parseCounts = (part) => {
          const idx = part.indexOf(':');
          const nums = part.slice(idx + 1).split(',').map(s => parseInt(s.trim(), 10));
          if (nums.length !== 4 || nums.some(n => Number.isNaN(n) || n < 0)) throw new Error('Invalid counts');
          return nums;
        };
        const attackerCounts = parseCounts(attackerPart);
        const defenderCounts = parseCounts(defenderPart);
        this.armies = { attacker: attackerCounts, defender: defenderCounts };
        await this.sendUpdate(`Armies configured. Attacker: ${attackerCounts.join(', ')}; Defender: ${defenderCounts.join(', ')}`);
        // start battle controls
        await this.start();

      } catch (err) {
        await message.reply('Failed to parse setup. Use format: setup attacker: 3,1,0,0 ; defender: 2,2,0,0');
      }
    }
  }

  async _actionAttack(actorIndex) {
    if (this.busy) return;
    this.busy = true;
    try {
      const targetIndex = this._opponentIndex(actorIndex);
      const damage = Math.floor(Math.random() * 15) + 5; // 5-19 damage
      this.players[targetIndex].hp = Math.max(0, this.players[targetIndex].hp - damage);
      this.log.push(`${this.players[actorIndex].username} attacked ${this.players[targetIndex].username} for ${damage} damage.`);
      await this.sendUpdate(`${this.players[actorIndex].username} attacks ${this.players[targetIndex].username} for ${damage} damage.`);

      // check defeat
      if (this.players[targetIndex].hp <= 0) {
        await this.sendUpdate(`${this.players[targetIndex].username} has been defeated! ${this.players[actorIndex].username} wins!`);
        // session could be cleaned up by bot afterwards
      } else {
        // next turn
        this.turn = targetIndex;
        await this.sendUpdate(`It's now ${this.players[this.turn].username}'s turn.`);
      }
    } finally {
      this.busy = false;
    }
  }

  async _actionRetreat(actorIndex) {
    if (this.busy) return;
    this.busy = true;
    try {
      const heal = Math.floor(Math.random() * 8) + 3; // 3-10 heal
      this.players[actorIndex].hp = Math.min(100, this.players[actorIndex].hp + heal);
      this.log.push(`${this.players[actorIndex].username} defended and recovered ${heal} HP.`);
      await this.sendUpdate(`${this.players[actorIndex].username} defends and recovers ${heal} HP.`);
      // turn passes
      this.turn = this._opponentIndex(actorIndex);
      await this.sendUpdate(`It's now ${this.players[this.turn].username}'s turn.`);
    } finally {
      this.busy = false;
    }
  }


}

module.exports = BattleSession;

