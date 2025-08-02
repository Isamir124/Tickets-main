/*
 * Bot de tickets - Licencia MIT
 * Copyright (c) 2025
 *
 * Se concede permiso, sin cargo, a cualquier persona que obtenga una copia
 * de este software y los archivos de documentación asociados (el "Software"),
 * para tratar el Software sin restricción, incluyendo sin limitación los derechos
 * a usar, copiar, modificar, fusionar, publicar, distribuir, sublicenciar
 * y/o vender copias del Software, sujeto a las condiciones de la Licencia MIT.
 *
 * EL SOFTWARE SE PROPORCIONA "TAL CUAL", SIN GARANTÍA DE NINGÚN TIPO.
 */

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const commandsArray = [];

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
    commandsArray.push(command.data.toJSON()); 
}

const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

client.once('ready', async () => {
    try {
        const guild = client.guilds.cache.get('Tu_GuildID'); // Cambia por el id de tu servidor
        await guild.commands.set(commandsArray); 
        console.log('✅ Slash commands registrados en la guild.');
    } catch (error) {
        console.error('❌ Error al registrar comandos:', error);
    }

    console.log(`✅ Bot iniciado como ${client.user.tag}`);
});


client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Error ejecutando el comando.', ephemeral: true });
      }
    }
  });

client.login('tu_token_xd'); // Cambia por tu token
