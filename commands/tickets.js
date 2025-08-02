/*
 * Comando mejorado de tickets con sistema multiidioma y categorías avanzadas
 */

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const languageManager = require('../utils/LanguageManager');

// Configuración avanzada
const CONFIG = {
    LOGS_CHANNEL_ID: '1401026714938769478',
    ALLOWED_ROLES: ['1305639336871596103'],
    TICKET_CATEGORIES: [
        {
            name: 'support',
            emoji: '🛠️',
            details: 'Problemas técnicos, bugs, errores del sistema'
        },
        {
            name: 'report',
            emoji: '🚫',
            details: 'Reportar usuarios, comportamientos indebidos'
        },
        {
            name: 'question',
            emoji: '❓',
            details: 'Consultas generales, preguntas sobre servicios'
        },
        {
            name: 'billing',
            emoji: '💳',
            details: 'Problemas de facturación, pagos, suscripciones'
        },
        {
            name: 'feature',
            emoji: '✨',
            details: 'Sugerencias de mejoras, nuevas funcionalidades'
        }
    ]
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('📩 Envía el menú profesional de categorías para crear tickets')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        try {
            // Verificar permisos
            const isAllowed = interaction.member.roles.cache.some(role => 
                CONFIG.ALLOWED_ROLES.includes(role.id)
            ) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isAllowed) {
                return interaction.reply({
                    content: languageManager.get('system.permission_denied', interaction.guild.id, interaction.user.id),
                    ephemeral: true
                });
            }

            // Detectar idioma automáticamente si es la primera vez
            languageManager.detectLanguage(interaction.guild);
            
            const lang = languageManager.getLanguage(interaction.guild.id, interaction.user.id);
            const categories = languageManager.getSection('tickets.categories', interaction.guild.id, interaction.user.id);

            // Crear embed profesional multiidioma
            const embed = new EmbedBuilder()
                .setTitle(languageManager.get('tickets.center_title', interaction.guild.id, interaction.user.id))
                .setDescription(languageManager.get('tickets.center_description', interaction.guild.id, interaction.user.id))
                .setColor('#5865F2')
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setFooter({ 
                    text: `${languageManager.get('system.name', interaction.guild.id, interaction.user.id)} | Multiidioma Profesional`,
                    iconURL: interaction.client.user.displayAvatarURL()
                });

            // Añadir campos de categorías dinámicamente
            CONFIG.TICKET_CATEGORIES.forEach(category => {
                const categoryData = categories[category.name];
                if (categoryData) {
                    embed.addFields({
                        name: `${category.emoji} ${categoryData.name}`,
                        value: categoryData.details,
                        inline: false
                    });
                }
            });

            // Crear menú de selección profesional
            const menu = new StringSelectMenuBuilder()
                .setCustomId('menu_categoria')
                .setPlaceholder(languageManager.get('tickets.select_placeholder', interaction.guild.id, interaction.user.id))
                .addOptions(
                    CONFIG.TICKET_CATEGORIES.map(category => {
                        const categoryData = categories[category.name];
                        return {
                            label: categoryData?.name || category.name,
                            value: category.name,
                            description: categoryData?.description || 'Descripción no disponible',
                            emoji: category.emoji
                        };
                    })
                );

            const row = new ActionRowBuilder().addComponents(menu);

            // Buscar canal objetivo
            const targetChannel = interaction.guild.channels.cache.get(CONFIG.LOGS_CHANNEL_ID);
            
            if (!targetChannel) {
                return interaction.reply({ 
                    content: languageManager.get('commands.ticket.no_channel', interaction.guild.id, interaction.user.id),
                    ephemeral: true 
                });
            }

            // Verificar permisos del bot
            if (!targetChannel.permissionsFor(interaction.guild.members.me).has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                return interaction.reply({
                    content: languageManager.get('commands.ticket.no_permissions', interaction.guild.id, interaction.user.id),
                    ephemeral: true
                });
            }

            // Enviar menú profesional
            await targetChannel.send({ embeds: [embed], components: [row] });
            
            // Confirmación multiidioma
            await interaction.reply({ 
                content: languageManager.get('commands.ticket.success', interaction.guild.id, interaction.user.id, {
                    channel: targetChannel.toString()
                }),
                ephemeral: true 
            });

            // Log detallado
            console.log(`[TICKETS PROFESIONAL] Menú enviado por ${interaction.user.tag} en ${interaction.guild.name} (${lang})`);
            
        } catch (error) {
            console.error('Error en comando ticket profesional:', error);
            
            if (!interaction.replied) {
                await interaction.reply({
                    content: languageManager.get('system.error', interaction.guild.id, interaction.user.id),
                    ephemeral: true
                }).catch(console.error);
            }
        }
    }
};