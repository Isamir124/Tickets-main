/*
 * Comando para gestión de idiomas
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const languageManager = require('../utils/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('🌍 Gestionar idioma del bot')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Cambiar idioma del servidor')
                .addStringOption(option =>
                    option.setName('idioma')
                        .setDescription('Selecciona el idioma')
                        .setRequired(true)
                        .addChoices(
                            { name: '🇪🇸 Español', value: 'es' },
                            { name: '🇺🇸 English', value: 'en' },
                            { name: '🇫🇷 Français', value: 'fr' },
                            { name: '🇩🇪 Deutsch', value: 'de' },
                            { name: '🇧🇷 Português', value: 'pt' },
                            { name: '🇮🇹 Italiano', value: 'it' },
                            { name: '🇷🇺 Русский', value: 'ru' },
                            { name: '🇯🇵 日本語', value: 'ja' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Cambiar tu idioma personal')
                .addStringOption(option =>
                    option.setName('idioma')
                        .setDescription('Selecciona tu idioma')
                        .setRequired(true)
                        .addChoices(
                            { name: '🇪🇸 Español', value: 'es' },
                            { name: '🇺🇸 English', value: 'en' },
                            { name: '🇫🇷 Français', value: 'fr' },
                            { name: '🇩🇪 Deutsch', value: 'de' },
                            { name: '🇧🇷 Português', value: 'pt' },
                            { name: '🇮🇹 Italiano', value: 'it' },
                            { name: '🇷🇺 Русский', value: 'ru' },
                            { name: '🇯🇵 日本語', value: 'ja' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Ver información de idiomas')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const currentLang = languageManager.getLanguage(interaction.guild.id, interaction.user.id);

            switch (subcommand) {
                case 'set':
                    await this.handleSetGuildLanguage(interaction, currentLang);
                    break;
                case 'user':
                    await this.handleSetUserLanguage(interaction, currentLang);
                    break;
                case 'info':
                    await this.handleLanguageInfo(interaction, currentLang);
                    break;
            }

        } catch (error) {
            console.error('Error en comando language:', error);
            await interaction.reply({
                content: '❌ Error procesando comando de idioma.',
                ephemeral: true
            }).catch(console.error);
        }
    },

    async handleSetGuildLanguage(interaction, currentLang) {
        // Verificar permisos
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: languageManager.get('system.permission_denied', interaction.guild.id, interaction.user.id),
                ephemeral: true
            });
        }

        const newLanguage = interaction.options.getString('idioma');
        
        if (languageManager.setGuildLanguage(interaction.guild.id, newLanguage)) {
            const embed = new EmbedBuilder()
                .setTitle('🌍 Idioma del Servidor Actualizado')
                .setDescription(`El idioma del servidor ha sido cambiado a **${this.getLanguageName(newLanguage)}**`)
                .setColor('#00FF00')
                .addFields(
                    {
                        name: 'Idioma Anterior',
                        value: this.getLanguageName(currentLang),
                        inline: true
                    },
                    {
                        name: 'Nuevo Idioma',
                        value: this.getLanguageName(newLanguage),
                        inline: true
                    },
                    {
                        name: 'Alcance',
                        value: 'Todos los usuarios del servidor',
                        inline: false
                    }
                )
                .setFooter({
                    text: 'Los usuarios pueden establecer su idioma personal con /language user'
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            
            console.log(`🌍 Idioma del servidor ${interaction.guild.name} cambiado a ${newLanguage} por ${interaction.user.tag}`);
        } else {
            await interaction.reply({
                content: '❌ Error cambiando el idioma del servidor.',
                ephemeral: true
            });
        }
    },

    async handleSetUserLanguage(interaction, currentLang) {
        const newLanguage = interaction.options.getString('idioma');
        
        if (languageManager.setUserLanguage(interaction.user.id, newLanguage)) {
            const embed = new EmbedBuilder()
                .setTitle('🌍 Tu Idioma Personal Actualizado')
                .setDescription(`Tu idioma personal ha sido cambiado a **${this.getLanguageName(newLanguage)}**`)
                .setColor('#00FF00')
                .addFields(
                    {
                        name: 'Idioma Anterior',
                        value: this.getLanguageName(currentLang),
                        inline: true
                    },
                    {
                        name: 'Nuevo Idioma',
                        value: this.getLanguageName(newLanguage),
                        inline: true
                    },
                    {
                        name: 'Nota',
                        value: 'Este idioma se aplicará solo para ti en todos los servidores',
                        inline: false
                    }
                )
                .setFooter({
                    text: 'Para volver al idioma del servidor, contacta a un administrador'
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
            
            console.log(`🌍 Idioma personal de ${interaction.user.tag} cambiado a ${newLanguage}`);
        } else {
            await interaction.reply({
                content: '❌ Error cambiando tu idioma personal.',
                ephemeral: true
            });
        }
    },

    async handleLanguageInfo(interaction, currentLang) {
        const supportedLanguages = languageManager.getSupportedLanguages();
        const guildLang = languageManager.getLanguage(interaction.guild.id);
        const userLang = languageManager.getLanguage(null, interaction.user.id);
        
        const embed = new EmbedBuilder()
            .setTitle('🌍 Información de Idiomas')
            .setDescription('Configuración actual y idiomas disponibles')
            .setColor('#FFD700')
            .addFields(
                {
                    name: '🏛️ Idioma del Servidor',
                    value: `${languageManager.getLanguageFlag(guildLang)} ${this.getLanguageName(guildLang)}`,
                    inline: true
                },
                {
                    name: '👤 Tu Idioma Personal',
                    value: userLang ? `${languageManager.getLanguageFlag(userLang)} ${this.getLanguageName(userLang)}` : 'Usando idioma del servidor',
                    inline: true
                },
                {
                    name: '🎯 Idioma Activo',
                    value: `${languageManager.getLanguageFlag(currentLang)} ${this.getLanguageName(currentLang)}`,
                    inline: true
                },
                {
                    name: '🌐 Idiomas Disponibles',
                    value: supportedLanguages.map(lang => 
                        `${lang.flag} ${lang.name}`
                    ).join('\n'),
                    inline: false
                }
            )
            .setFooter({
                text: 'Usa /language set para el servidor o /language user para ti'
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    getLanguageName(code) {
        const names = {
            'es': 'Español',
            'en': 'English',
            'fr': 'Français',
            'de': 'Deutsch',
            'pt': 'Português',
            'it': 'Italiano',
            'ru': 'Русский',
            'ja': '日本語'
        };
        return names[code] || code.toUpperCase();
    }
};