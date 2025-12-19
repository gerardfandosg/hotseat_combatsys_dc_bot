require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { warn, error, info, success } = require("../src/utils/Console");
const {Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent] });

// sessions map for thread-based sessions
client.sessions = new Map();

client.once(Events.ClientReady, (readyClient) => {
	success(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
			success(`Loaded command: ${command.data.name}`);
		} else {
			warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
	// Route message component interactions (buttons/selects) to active thread sessions
	try {
		if (interaction.isMessageComponent && interaction.channelId) {
			const session = interaction.client.sessions?.get(interaction.channelId);
			if (session && typeof session.handleInteraction === 'function') {
				await session.handleInteraction(interaction);
				return;
			}
		}
	} catch (err) {
		console.error('Error routing component interaction to session:', err);
	}

	if (!interaction.isChatInputCommand()) return;
	info(interaction);

	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.reply({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		}
	}

});

// Route plain messages in threads to sessions (supports 'setup', '!attack', '!status' etc.)
client.on(Events.MessageCreate, async (message) => {
	try {
		if (message.author?.bot) return;
		const session = client.sessions.get(message.channelId);
		if (session && typeof session.handleMessage === 'function') {
			await session.handleMessage(message);
		}
	} catch (err) {
		console.error('Error routing message to session:', err);
	}
});

client.login(process.env.CLIENT_TOKEN);