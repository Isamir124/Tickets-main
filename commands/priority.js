/*
 * Comando para gestionar prioridades de tickets
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const priorityManager = require('../utils/PriorityManager');
const languageManager = require('../utils/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('priority')
        .setDescription('⚡ Gestionar prioridades de tickets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Cambiar prioridad de un ticket')
                .addChannelOption(option =>
                    option.setName('ticket')
                        .setDescription('Canal del ticket (usar en el canal del ticket)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('prioridad')
                        .setDescription('Nueva prioridad')
                        .setRequired(true)
                        .addChoices(
                            { name: '🔴 CRÍTICA', value: 'critical' },
                            { name: '🟠 ALTA', value: 'high' },
                            { name: '🟡 MEDIA', value: 'medium' },
                            { name: '🟢 BAJA', value: 'low' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Ver información sobre prioridades')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('metrics')
                .setDescription('Ver métricas de prioridades')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const lang = languageManager.getLanguage(interaction.guild.id, interaction.user.id);

            // Verificar permisos básicos
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return interaction.reply({
                    content: languageManager.get('system.permission_denied', interaction.guild.id, interaction.user.id),
                    ephemeral: true
                });
            }

            switch (subcommand) {
                case 'set':
                    await this.handleSetPriority(interaction, lang);
                    break;
                case 'info':
                    await this.handlePriorityInfo(interaction, lang);
                    break;
                case 'metrics':
                    await this.handlePriorityMetrics(interaction, lang);
                    break;
            }

        } catch (error) {
            console.error('Error en comando priority:', error);
            await interaction.reply({
                content: '❌ Error procesando comando de prioridad.',
                ephemeral: true
            }).catch(console.error);
        }
    },

    async handleSetPriority(interaction, lang) {
        const targetChannel = interaction.options.getChannel('ticket') || interaction.channel;
        const newPriority = interaction.options.getString('prioridad');

        // Verificar si es un canal de ticket
        if (!targetChannel.name.startsWith('ticket-')) {
            return interaction.reply({
                content: '❌ Este comando solo funciona en canales de tickets.',
                ephemeral: true
            });
        }

        try {
            // Cargar datos del ticket (aquí deberías usar tu sistema de base de datos)
            const fs = require('fs').promises;
            const path = require('path');
            const dbPath = path.join(__dirname, '../data/tickets.json');
            
            let ticketsDB = {};
            try {
                const data = await fs.readFile(dbPath, 'utf-8');
                ticketsDB = JSON.parse(data);
            } catch (error) {
                return interaction.reply({
                    content: '❌ No se pudo acceder a la base de datos de tickets.',
                    ephemeral: true
                });
            }

            const ticketData = ticketsDB[targetChannel.id];
            if (!ticketData) {
                return interaction.reply({
                    content: '❌ No se encontraron datos para este ticket.',
                    ephemeral: true
                });
            }

            const oldPriority = ticketData.priority || 'medium';
            const priorityConfig = priorityManager.getPriorityConfig(newPriority);
            const oldConfig = priorityManager.getPriorityConfig(oldPriority);

            // Actualizar prioridad
            ticketData.priority = newPriority;
            ticketData.priorityChangedAt = Date.now();
            ticketData.priorityChangedBy = interaction.user.id;

            // Guardar cambios
            await fs.writeFile(dbPath, JSON.stringify(ticketsDB, null, 2));

            // Crear embed de confirmación
            const embed = new EmbedBuilder()
                .setTitle('⚡ Prioridad Actualizada')
                .setDescription(`La prioridad del ticket ha sido modificada`)
                .setColor(priorityConfig.color)
                .addFields(
                    {
                        name: 'Prioridad Anterior',
                        value: `${oldConfig.emoji} ${oldConfig.name}`,
                        inline: true
                    },
                    {
                        name: 'Nueva Prioridad',
                        value: `${priorityConfig.emoji} ${priorityConfig.name}`,
                        inline: true
                    },
                    {
                        name: '⏱️ Nuevo SLA',
                        value: `${priorityConfig.slaHours} horas`,
                        inline: true
                    },
                    {
                        name: '🔔 Escalación',
                        value: `${priorityConfig.escalationMinutes} minutos`,
                        inline: true
                    },
                    {
                        name: 'Modificado por',
                        value: `<@${interaction.user.id}>`,
                        inline: true
                    },
                    {
                        name: 'Fecha',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                        inline: true
                    }
                )
                .setFooter({
                    text: `Ticket ID: ${ticketData.id}`
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Notificar en el canal del ticket si es diferente
            if (targetChannel.id !== interaction.channel.id) {
                await targetChannel.send({
                    content: `⚡ **Prioridad actualizada** por <@${interaction.user.id}>`,
                    embeds: [embed]
                });
            }

            // Log del cambio
            console.log(`⚡ Prioridad del ticket ${ticketData.id} cambiada de ${oldPriority} a ${newPriority} por ${interaction.user.tag}`);

        } catch (error) {
            console.error('Error cambiando prioridad:', error);
            await interaction.reply({
                content: '❌ Error actualizando la prioridad del ticket.',
                ephemeral: true
            });
        }
    },

    async handlePriorityInfo(interaction, lang) {
        const priorities = priorityManager.getAllPriorities();

        const embed = new EmbedBuilder()
            .setTitle('⚡ Información de Prioridades')
            .setDescription('Sistema de niveles de prioridad para tickets')
            .setColor('#FFD700')
            .setTimestamp();

        for (const [key, config] of Object.entries(priorities)) {
            embed.addFields({
                name: `${config.emoji} ${config.name}`,
                value: `**SLA:** ${config.slaHours} horas\n**Escalación:** ${config.escalationMinutes} minutos\n**Uso:** ${this.getPriorityUsage(key)}`,
                inline: true
            });
        }

        embed.addFields({
            name: '🔄 Detección Automática',
            value: 'Las prioridades se asignan automáticamente basándose en:\n• Palabras clave en la descripción\n• Categoría del ticket\n• Contexto y urgencia detectada',
            inline: false
        });

        embed.addFields({
            name: '📊 SLA (Service Level Agreement)',
            value: 'Tiempo máximo esperado para resolución según prioridad. Las violaciones de SLA se registran automáticamente.',
            inline: false
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handlePriorityMetrics(interaction, lang) {
        try {
            // Cargar tickets para calcular métricas
            const fs = require('fs').promises;
            const path = require('path');
            const dbPath = path.join(__dirname, '../data/tickets.json');
            
            let ticketsDB = {};
            try {
                const data = await fs.readFile(dbPath, 'utf-8');
                ticketsDB = JSON.parse(data);
            } catch (error) {
                return interaction.reply({
                    content: '❌ No se pudo acceder a la base de datos de tickets.',
                    ephemeral: true
                });
            }

            // Filtrar solo datos de tickets (no metadatos)
            const tickets = Object.entries(ticketsDB)
                .filter(([key]) => !key.startsWith('_'))
                .map(([_, data]) => data);

            if (tickets.length === 0) {
                return interaction.reply({
                    content: '📊 No hay tickets disponibles para generar métricas.',
                    ephemeral: true
                });
            }

            const metrics = priorityManager.calculatePriorityMetrics(tickets);

            const embed = new EmbedBuilder()
                .setTitle('📊 Métricas de Prioridades')
                .setDescription(`Análisis basado en ${tickets.length} tickets`)
                .setColor('#FF6B6B')
                .setTimestamp();

            // Distribución por prioridad
            const totalTickets = Object.values(metrics.distribution).reduce((a, b) => a + b, 0);
            let distributionText = '';
            
            Object.entries(metrics.distribution).forEach(([priority, count]) => {
                const percentage = totalTickets > 0 ? Math.round((count / totalTickets) * 100) : 0;
                const config = priorityManager.getPriorityConfig(priority);
                distributionText += `${config.emoji} **${config.name}:** ${count} (${percentage}%)\n`;
            });

            embed.addFields({
                name: '📈 Distribución de Prioridades',
                value: distributionText,
                inline: false
            });

            // Cumplimiento de SLA
            let slaText = '';
            Object.entries(metrics.slaCompliance).forEach(([priority, percentage]) => {
                const config = priorityManager.getPriorityConfig(priority);
                const statusEmoji = percentage >= 80 ? '✅' : percentage >= 60 ? '⚠️' : '❌';
                slaText += `${config.emoji} **${config.name}:** ${percentage}% ${statusEmoji}\n`;
            });

            embed.addFields({
                name: '⏱️ Cumplimiento de SLA',
                value: slaText,
                inline: true
            });

            // Tiempos promedio de resolución
            let resolutionText = '';
            Object.entries(metrics.avgResolutionTime).forEach(([priority, time]) => {
                const config = priorityManager.getPriorityConfig(priority);
                resolutionText += `${config.emoji} **${config.name}:** ${time}\n`;
            });

            embed.addFields({
                name: '🕐 Tiempo Promedio de Resolución',
                value: resolutionText,
                inline: true
            });

            // Escalaciones
            const escalationRate = totalTickets > 0 ? Math.round((metrics.escalations / totalTickets) * 100) : 0;
            embed.addFields({
                name: '🚨 Escalaciones',
                value: `**Total:** ${metrics.escalations}\n**Tasa:** ${escalationRate}%`,
                inline: true
            });

            // Recomendaciones
            let recommendations = [];
            
            if (metrics.slaCompliance.critical < 90) {
                recommendations.push('🔴 Mejorar tiempo de respuesta para tickets críticos');
            }
            if (escalationRate > 15) {
                recommendations.push('🟡 Reducir tasa de escalación con mejor triaje inicial');
            }
            if (metrics.distribution.critical > 20) {
                recommendations.push('🟠 Revisar criterios de asignación de prioridad crítica');
            }

            if (recommendations.length > 0) {
                embed.addFields({
                    name: '💡 Recomendaciones',
                    value: recommendations.join('\n'),
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Error generando métricas de prioridad:', error);
            await interaction.reply({
                content: '❌ Error generando métricas de prioridades.',
                ephemeral: true
            });
        }
    },

    getPriorityUsage(priority) {
        const usage = {
            critical: 'Sistemas caídos, pérdida de datos, emergencias',
            high: 'Problemas graves, bloqueos importantes',
            medium: 'Consultas normales, issues estándar',
            low: 'Sugerencias, mejoras, preguntas generales'
        };
        return usage[priority] || 'Uso general';
    }
};