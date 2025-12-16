const { SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('battlethread')
		.setDescription('Creates a thread in a channel')
		.addChannelOption(option =>
			option
				.setName('channel')
				.setDescription('The channel to create the thread in')
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(true)
		)
		.addStringOption(option =>
			option
				.setName('name')
				.setDescription('The name of the thread')
				.setRequired(true)
				.setMaxLength(100)
		)
		.addStringOption(option =>
			option
				.setName('message')
				.setDescription('Optional message to send in the thread')
				.setRequired(false)
		),
    
	async execute(interaction) {
		try {
			const channel = interaction.options.getChannel('channel');
			const threadName = interaction.options.getString('name');
			const message = interaction.options.getString('message');

			// Create the thread
			const thread = await channel.threads.create({
				name: threadName,
				autoArchiveDuration: 60, // Auto-archive after 1 hour of inactivity
			});

			// Send optional message to the thread
			if (message) {
				await thread.send(message);
			}

			await interaction.reply(`Thread "${threadName}" created successfully in ${channel}!`);
		} catch (error) {
			console.error('Error creating thread:', error);
			await interaction.reply({
				content: 'There was an error creating the thread.',
				ephemeral: true,
			});
		}
	},
};
