/*
 * Bot de tickets - Licencia MIT
 * Copyright (c) 2025 maestro_oda
 *
 * Se concede permiso, sin cargo, a cualquier persona que obtenga una copia
 * de este software y los archivos de documentación asociados (el "Software"),
 * para tratar el Software sin restricción, incluyendo sin limitación los derechos
 * a usar, copiar, modificar, fusionar, publicar, distribuir, sublicenciar
 * y/o vender copias del Software, sujeto a las condiciones de la Licencia MIT.
 *
 * EL SOFTWARE SE PROPORCIONA "TAL CUAL", SIN GARANTÍA DE NINGÚN TIPO.
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../data/tickets.json');

let ticketsDb = { blacklist: {}, stats: {} };
// Carga segura de la base de datos
if (fs.existsSync(dbPath)) {
  try {
    ticketsDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  } catch (error) {
    console.error('Error al leer tickets.json:', error);
  }
}
// Asegurar que las propiedades existan
ticketsDb.blacklist ??= {};
ticketsDb.stats ??= {};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('🛑 Agrega o elimina a un usuario de la blacklist de tickets.')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Usuario a agregar o quitar de la blacklist')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const user = interaction.options.getUser('usuario');
    if (!user) {
      return interaction.reply({ content: 'Usuario no válido.', ephemeral: true });
    }

    try {
      if (ticketsDb.blacklist[user.id]) {
        delete ticketsDb.blacklist[user.id];
        await interaction.reply(`✅ <@${user.id}> fue **eliminado** de la blacklist.`);
      } else {
        ticketsDb.blacklist[user.id] = true;
        // Enviar MD al usuario agregado a blacklist
        try {
          await user.send('🚫 Has sido agregado a la blacklist de tickets. Ya no podrás abrir más tickets.');
        } catch {
          console.log(`No se pudo enviar MD a <@${user.id}>.`);
        }
        await interaction.reply(`🚫 <@${user.id}> fue **agregado** a la blacklist.`);
      }

      fs.writeFileSync(dbPath, JSON.stringify(ticketsDb, null, 2));
    } catch (error) {
      console.error('Error en comando blacklist:', error);
      await interaction.reply({ content: '❌ Ocurrió un error al procesar la blacklist.', ephemeral: true });
    }
  }
};
