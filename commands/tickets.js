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

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

// Configuración
const CONFIG = {
    LOGS_CHANNEL_ID: '1401026714938769478', // Canal donde se enviará el menú
    ALLOWED_ROLES: ['1305639336871596103'], // Roles que pueden usar este comando
    TICKET_CATEGORIES: [
        {
            name: '🛠️ Soporte Técnico',
            value: 'soporte',
            description: 'Problemas técnicos o ayuda con servicios',
            emoji: '🛠️',
            details: '¿Tienes problemas con algún servicio, bot o sistema? Estamos aquí para ayudarte.'
        },
        {
            name: '🚫 Reportar Usuario',
            value: 'reporte',
            description: 'Reporta comportamientos indebidos',
            emoji: '🚫',
            details: '¿Has tenido un problema con otro usuario? Inicia un ticket y el staff lo revisará.'
        },
        {
            name: '❓ Preguntas Generales',
            value: 'pregunta',
            description: 'Haz cualquier consulta general sobre el servidor',
            emoji: '❓',
            details: '¿Tienes dudas sobre el servidor o cómo funciona algo? Pregúntanos aquí.'
        }
    ]
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('📩 Envía el menú de categorías para crear tickets de soporte')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Solo administradores por defecto
        .setDMPermission(false),

    /**
     * Ejecuta el comando para enviar el menú de tickets
     * @param {import('discord.js').CommandInteraction} interaction 
     */
    async execute(interaction) {
        try {
            // Verificar permisos
            const isAllowed = interaction.member.roles.cache.some(role => 
                CONFIG.ALLOWED_ROLES.includes(role.id)
            ) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isAllowed) {
                return interaction.reply({
                    content: '❌ No tienes permiso para usar este comando.',
                    ephemeral: true
                });
            }

            // Crear embed
            const embed = new EmbedBuilder()
                .setTitle('🎫 Centro de Soporte')
                .setDescription('Selecciona la categoría que mejor describa tu situación para que podamos ayudarte de forma más rápida y eficiente.')
                .setColor('#5865F2')
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .addFields(
                    ...CONFIG.TICKET_CATEGORIES.map(category => ({
                        name: category.name,
                        value: category.details,
                        inline: false
                    }))
                )
                .setFooter({ 
                    text: 'Sistema de tickets | Solo el staff puede cerrar los tickets',
                    iconURL: interaction.client.user.displayAvatarURL()
                });

            // Crear menú de selección
            const menu = new StringSelectMenuBuilder()
                .setCustomId('menu_categoria')
                .setPlaceholder('📌 Selecciona una categoría de ayuda')
                .addOptions(
                    CONFIG.TICKET_CATEGORIES.map(category => ({
                        label: category.name.replace(/^\S+\s/, ''), // Remover emoji
                        value: category.value,
                        description: category.description,
                        emoji: category.emoji
                    }))
                );

            const row = new ActionRowBuilder().addComponents(menu);

            // Buscar canal y enviar mensaje
            const targetChannel = interaction.guild.channels.cache.get(CONFIG.LOGS_CHANNEL_ID);
            
            if (!targetChannel) {
                return interaction.reply({ 
                    content: '❌ No se encontró el canal de tickets. Verifica la configuración.',
                    ephemeral: true 
                });
            }

            if (!targetChannel.permissionsFor(interaction.guild.members.me).has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                return interaction.reply({
                    content: '❌ No tengo permisos para enviar mensajes en ese canal.',
                    ephemeral: true
                });
            }

            await targetChannel.send({ embeds: [embed], components: [row] });
            
            // Confirmación al usuario
            await interaction.reply({ 
                content: `✅ Menú de tickets enviado correctamente a ${targetChannel}.`,
                ephemeral: true 
            });

            // Log en consola
            console.log(`[TICKETS] Menú enviado por ${interaction.user.tag} en ${interaction.guild.name}`);
            
        } catch (error) {
            console.error('Error al ejecutar el comando ticket:', error);
            
            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ Ocurrió un error al procesar el comando. Por favor, inténtalo nuevamente.',
                    ephemeral: true
                }).catch(console.error);
            } else {
                await interaction.followUp({
                    content: '❌ Ocurrió un error después de enviar la respuesta inicial.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    }
};