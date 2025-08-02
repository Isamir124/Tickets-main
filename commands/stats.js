/*
 * Comando para ver estadísticas avanzadas
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const statsManager = require('../utils/StatsManager');
const languageManager = require('../utils/LanguageManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('📊 Ver estadísticas avanzadas del sistema de tickets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('summary')
                .setDescription('Resumen general de estadísticas')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('staff')
                .setDescription('Rendimiento del staff')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('trends')
                .setDescription('Tendencias y métricas temporales')
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('Días hacia atrás (por defecto: 30)')
                        .setMinValue(1)
                        .setMaxValue(365)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('export')
                .setDescription('Exportar estadísticas')
                .addStringOption(option =>
                    option.setName('format')
                        .setDescription('Formato de exportación')
                        .setRequired(true)
                        .addChoices(
                            { name: 'CSV - Tickets', value: 'tickets' },
                            { name: 'CSV - Staff', value: 'staff' },
                            { name: 'CSV - Diario', value: 'daily' }
                        )
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const lang = languageManager.getLanguage(interaction.guild.id, interaction.user.id);

            // Verificar permisos
            if (!interaction.member.permissions.has([PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels])) {
                return interaction.reply({
                    content: languageManager.get('system.permission_denied', interaction.guild.id, interaction.user.id),
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            switch (subcommand) {
                case 'summary':
                    await this.handleSummaryStats(interaction, lang);
                    break;
                case 'staff':
                    await this.handleStaffStats(interaction, lang);
                    break;
                case 'trends':
                    await this.handleTrendsStats(interaction, lang);
                    break;
                case 'export':
                    await this.handleExportStats(interaction, lang);
                    break;
            }

        } catch (error) {
            console.error('Error en comando stats:', error);
            await interaction.editReply({
                content: '❌ Error obteniendo estadísticas.'
            }).catch(console.error);
        }
    },

    async handleSummaryStats(interaction, lang) {
        const stats = await statsManager.getSummaryStats();
        const realTimeMetrics = await statsManager.getRealTimeMetrics();

        const embed = new EmbedBuilder()
            .setTitle('📊 Resumen de Estadísticas')
            .setDescription('Métricas generales del sistema de tickets')
            .setColor('#FFD700')
            .addFields(
                {
                    name: '🎫 Tickets Totales',
                    value: stats.totalTickets.toString(),
                    inline: true
                },
                {
                    name: '🟢 Tickets Abiertos',
                    value: stats.openTickets.toString(),
                    inline: true
                },
                {
                    name: '✅ Tickets Cerrados',
                    value: stats.closedTickets.toString(),
                    inline: true
                },
                {
                    name: '⏱️ Tiempo Promedio de Respuesta',
                    value: stats.avgResponseTime,
                    inline: true
                },
                {
                    name: '⭐ Satisfacción Promedio',
                    value: `${stats.customerSatisfaction}/5.0`,
                    inline: true
                },
                {
                    name: '📈 Tasa de Escalación',
                    value: `${stats.escalationRate}%`,
                    inline: true
                },
                {
                    name: '📂 Categoría Más Popular',
                    value: stats.topCategory,
                    inline: true
                },
                {
                    name: '👑 Staff Más Activo',
                    value: stats.topStaff,
                    inline: true
                },
                {
                    name: '🚨 Estado del Sistema',
                    value: this.getSystemStatus(realTimeMetrics.alerts),
                    inline: true
                }
            )
            .setFooter({
                text: 'Actualizado en tiempo real'
            })
            .setTimestamp();

        // Añadir alertas si las hay
        if (realTimeMetrics.alerts.length > 0) {
            const alertsText = realTimeMetrics.alerts.map(alert => 
                `${this.getAlertEmoji(alert.type)} ${alert.message}`
            ).join('\n');
            
            embed.addFields({
                name: '⚠️ Alertas del Sistema',
                value: alertsText,
                inline: false
            });
        }

        // Botones para más detalles
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('stats_refresh')
                    .setLabel('🔄 Actualizar')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('stats_detailed')
                    .setLabel('📊 Detalles')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('stats_export')
                    .setLabel('📥 Exportar')
                    .setStyle(ButtonStyle.Success)
            );

        await interaction.editReply({ embeds: [embed], components: [buttons] });
    },

    async handleStaffStats(interaction, lang) {
        const staffReport = await statsManager.getStaffPerformanceReport();

        if (staffReport.length === 0) {
            return interaction.editReply({
                content: '📊 No hay datos de rendimiento del staff disponibles.',
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('👥 Rendimiento del Staff')
            .setDescription('Métricas de rendimiento del equipo de soporte')
            .setColor('#00FF00')
            .setTimestamp();

        // Mostrar top 10 staff members
        const topStaff = staffReport.slice(0, 10);
        
        let staffList = '';
        topStaff.forEach((staff, index) => {
            const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;
            staffList += `${medal} <@${staff.staffId}>\n`;
            staffList += `   📊 Tickets: ${staff.ticketsHandled} | ⏱️ Respuesta: ${staff.avgResponseTime} | ⭐ Satisfacción: ${staff.avgSatisfaction}/5\n\n`;
        });

        embed.addFields({
            name: '🏆 Ranking de Staff',
            value: staffList || 'No hay datos disponibles',
            inline: false
        });

        // Métricas generales del equipo
        const totalTickets = staffReport.reduce((sum, staff) => sum + staff.ticketsHandled, 0);
        const avgSatisfaction = staffReport.length > 0 ? 
            staffReport.reduce((sum, staff) => sum + staff.avgSatisfaction, 0) / staffReport.length : 0;

        embed.addFields(
            {
                name: '📈 Métricas del Equipo',
                value: `**Total de Tickets Manejados:** ${totalTickets}\n**Staff Activo:** ${staffReport.length}\n**Satisfacción Promedio:** ${Math.round(avgSatisfaction * 10) / 10}/5`,
                inline: false
            }
        );

        await interaction.editReply({ embeds: [embed] });
    },

    async handleTrendsStats(interaction, lang) {
        const days = interaction.options.getInteger('days') || 30;
        const dailyStats = await statsManager.getStatsByPeriod('day', days);
        const weeklyStats = await statsManager.getStatsByPeriod('week', Math.ceil(days / 7));

        // Calcular tendencias
        const dailyValues = Object.values(dailyStats);
        const totalTickets = dailyValues.reduce((sum, count) => sum + count, 0);
        const avgPerDay = totalTickets / days;
        
        // Encontrar pico y valle
        const maxDay = Object.keys(dailyStats).reduce((a, b) => 
            dailyStats[a] > dailyStats[b] ? a : b
        );
        const minDay = Object.keys(dailyStats).reduce((a, b) => 
            dailyStats[a] < dailyStats[b] ? a : b
        );

        const embed = new EmbedBuilder()
            .setTitle(`📈 Tendencias (Últimos ${days} días)`)
            .setDescription('Análisis temporal de tickets')
            .setColor('#FF6B6B')
            .addFields(
                {
                    name: '📊 Resumen del Período',
                    value: `**Total de Tickets:** ${totalTickets}\n**Promedio Diario:** ${Math.round(avgPerDay * 10) / 10}\n**Días Analizados:** ${days}`,
                    inline: true
                },
                {
                    name: '📈 Día con Más Actividad',
                    value: `**Fecha:** ${maxDay}\n**Tickets:** ${dailyStats[maxDay]}`,
                    inline: true
                },
                {
                    name: '📉 Día con Menos Actividad',
                    value: `**Fecha:** ${minDay}\n**Tickets:** ${dailyStats[minDay]}`,
                    inline: true
                }
            );

        // Mostrar últimos 7 días
        const recent7Days = Object.entries(dailyStats)
            .slice(-7)
            .map(([date, count]) => `**${date}:** ${count} tickets`)
            .join('\n');

        embed.addFields({
            name: '📅 Últimos 7 Días',
            value: recent7Days,
            inline: false
        });

        // Análisis de tendencia
        const firstWeek = dailyValues.slice(0, 7).reduce((sum, count) => sum + count, 0);
        const lastWeek = dailyValues.slice(-7).reduce((sum, count) => sum + count, 0);
        const trendPercentage = ((lastWeek - firstWeek) / firstWeek) * 100;

        let trendEmoji = '➡️';
        let trendText = 'estable';
        
        if (trendPercentage > 10) {
            trendEmoji = '📈';
            trendText = 'creciente';
        } else if (trendPercentage < -10) {
            trendEmoji = '📉';
            trendText = 'decreciente';
        }

        embed.addFields({
            name: `${trendEmoji} Tendencia General`,
            value: `La actividad está **${trendText}** (${Math.abs(Math.round(trendPercentage))}% de cambio)`,
            inline: false
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleExportStats(interaction, lang) {
        const format = interaction.options.getString('format');
        
        try {
            const csvData = await statsManager.exportToCSV(format);
            const fileName = `stats_${format}_${new Date().toISOString().split('T')[0]}.csv`;
            
            // Crear archivo temporal
            const fs = require('fs').promises;
            const path = require('path');
            const tempPath = path.join(__dirname, '../temp', fileName);
            
            // Asegurar que existe el directorio temp
            await fs.mkdir(path.dirname(tempPath), { recursive: true });
            await fs.writeFile(tempPath, csvData);

            const embed = new EmbedBuilder()
                .setTitle('📥 Exportación Completada')
                .setDescription(`Estadísticas exportadas en formato CSV`)
                .setColor('#00FF00')
                .addFields(
                    {
                        name: 'Tipo de Datos',
                        value: format.charAt(0).toUpperCase() + format.slice(1),
                        inline: true
                    },
                    {
                        name: 'Formato',
                        value: 'CSV',
                        inline: true
                    },
                    {
                        name: 'Fecha de Generación',
                        value: new Date().toLocaleString(),
                        inline: true
                    }
                )
                .setTimestamp();

            await interaction.editReply({ 
                embeds: [embed],
                files: [{
                    attachment: tempPath,
                    name: fileName
                }]
            });

            // Limpiar archivo temporal después de 5 minutos
            setTimeout(async () => {
                try {
                    await fs.unlink(tempPath);
                } catch (error) {
                    console.error('Error eliminando archivo temporal:', error);
                }
            }, 5 * 60 * 1000);

        } catch (error) {
            console.error('Error exportando estadísticas:', error);
            await interaction.editReply({
                content: '❌ Error generando la exportación de estadísticas.'
            });
        }
    },

    getSystemStatus(alerts) {
        if (alerts.length === 0) {
            return '🟢 Operativo';
        } else if (alerts.some(alert => alert.type === 'error')) {
            return '🔴 Requiere Atención';
        } else {
            return '🟡 Con Advertencias';
        }
    },

    getAlertEmoji(type) {
        const emojis = {
            'error': '🔴',
            'warning': '🟡',
            'info': '🔵'
        };
        return emojis[type] || '⚪';
    }
};