const { SlashCommandBuilder, ChannelType } = require('discord.js');
const BattleSession = require('../../battle/BattleSession');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('battlethread')
		.setDescription('Creates a private battle thread')
		.addUserOption(option =>
			option
				.setName('attacker')
				.setDescription('The attacking user')
				.setRequired(true)
		)
		.addUserOption(option =>
			option
				.setName('defender')
				.setDescription('The defending user')
				.setRequired(true)
		),
    
	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });
		try {
			
			const channel = interaction.channel
			const attackerUser = interaction.options.getUser('attacker');
			const defenderUser = interaction.options.getUser('defender');
			const adminUser = interaction.user;

			const threadName = `Battle: ${attackerUser.username} vs ${defenderUser.username}`;

			// Create a private thread
			const thread = await channel.threads.create({
				name: threadName,
				type: ChannelType.PrivateThread
			});

			// Collect member IDs to add: role members + attacker + defender
			const memberIds = new Set();
			memberIds.add(attackerUser.id);
			memberIds.add(defenderUser.id);
			memberIds.add(adminUser.id);

			// Add each member to the private thread. Ignore failures per-member.
			for (const id of memberIds) {
				try {
					await thread.members.add(id);
				} catch (err) {
					// Log and continue; some members may be unjoinable (not in guild etc.)
					console.warn(`Could not add member ${id} to thread:`, err?.message || err);
				}
			}


			await thread.send(`Private battle thread created: ${threadName}`);

			// instantiate session and store it on the client for routing
			try {
				const players = [attackerUser, defenderUser];
				const session = new BattleSession(interaction.client, thread.id, players, adminUser.id);
				// ensure sessions map exists
				if (!interaction.client.sessions) interaction.client.sessions = new Map();
				interaction.client.sessions.set(thread.id, session);
				// start the session (sends initial message with buttons)
				await session.start();
			} catch (sessErr) {
				console.error('Could not create BattleSession:', sessErr);
			}

			return interaction.editReply({ content: `Thread "${threadName}" created and members invited.` });

		} catch (error) {

			console.error('Error creating private battle thread:', error);
			return interaction.editReply({ content: 'There was an error creating the private battle thread.' });

		}
	},
};
