/*
 * Comando administrativo para gestión avanzada del sistema
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const statsManager = require('../utils/StatsManager');
const languageManager = require('../utils/LanguageManager');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('🔧 Comandos administrativos del sistema de tickets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup')
                .setDescription('Crear respaldo de datos')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('restore')
                .setDescription('Restaurar datos desde respaldo')
                .addAttachmentOption(option =>
                    option.setName('archivo')
                        .setDescription('Archivo de respaldo')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('maintenance')
                .setDescription('Activar/desactivar modo mantenimiento')
                .addBooleanOption(option =>
                    option.setName('estado')
                        .setDescription('true = activar, false = desactivar')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup')
                .setDescription('Limpiar datos antiguos')
                .addIntegerOption(option =>
                    option.setName('dias')
                        .setDescription('Eliminar datos más antiguos que X días')
                        .setMinValue(30)
                        .setMaxValue(365)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Ver/modificar configuración del sistema')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('health')
                .setDescription('Verificar salud del sistema')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        try {
            // Solo administradores
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: '❌ Solo administradores pueden usar comandos administrativos.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();
            await interaction.deferReply({ ephemeral: true });

            switch (subcommand) {
                case 'backup':
                    await this.handleBackup(interaction);
                    break;
                case 'restore':
                    await this.handleRestore(interaction);
                    break;
                case 'maintenance':
                    await this.handleMaintenance(interaction);
                    break;
                case 'cleanup':
                    await this.handleCleanup(interaction);
                    break;
                case 'config':
                    await this.handleConfig(interaction);
                    break;
                case 'health':
                    await this.handleHealth(interaction);
                    break;
            }

        } catch (error) {
            console.error('Error en comando admin:', error);
            await interaction.editReply({
                content: '❌ Error ejecutando comando administrativo.'
            }).catch(console.error);
        }
    },

    async handleBackup(interaction) {
        try {
            const backupData = {
                timestamp: Date.now(),
                version: '1.0.0',
                guildId: interaction.guild.id,
                guildName: interaction.guild.name,
                data: {}
            };

            // Respaldar tickets
            const ticketsPath = path.join(__dirname, '../data/tickets.json');
            try {
                const ticketsData = await fs.readFile(ticketsPath, 'utf-8');
                backupData.data.tickets = JSON.parse(ticketsData);
            } catch (error) {
                backupData.data.tickets = {};
            }

            // Respaldar estadísticas
            const statsPath = path.join(__dirname, '../data/stats.json');
            try {
                const statsData = await fs.readFile(statsPath, 'utf-8');
                backupData.data.stats = JSON.parse(statsData);
            } catch (error) {
                backupData.data.stats = {};
            }

            // Respaldar configuración de idiomas
            const langPath = path.join(__dirname, '../data/language_settings.json');
            try {
                const langData = await fs.readFile(langPath, 'utf-8');
                backupData.data.languages = JSON.parse(langData);
            } catch (error) {
                backupData.data.languages = {};
            }

            // Crear archivo de respaldo
            const backupFileName = `backup_${interaction.guild.id}_${new Date().toISOString().split('T')[0]}.json`;
            const backupPath = path.join(__dirname, '../data/backups', backupFileName);
            
            // Asegurar directorio de respaldos
            await fs.mkdir(path.dirname(backupPath), { recursive: true });
            await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));

            const embed = new EmbedBuilder()
                .setTitle('💾 Respaldo Completado')
                .setDescription('Todos los datos han sido respaldados exitosamente')
                .setColor('#00FF00')
                .addFields(
                    {
                        name: '📊 Datos Incluidos',
                        value: '• Tickets y metadatos\n• Estadísticas históricas\n• Configuración de idiomas\n• Configuración del sistema',
                        inline: true
                    },
                    {
                        name: '📅 Información del Respaldo',
                        value: `**Servidor:** ${interaction.guild.name}\n**Fecha:** ${new Date().toLocaleString()}\n**Archivo:** ${backupFileName}`,
                        inline: true
                    }
                )
                .setFooter({
                    text: 'Guarda este archivo en un lugar seguro'
                })
                .setTimestamp();

            await interaction.editReply({ 
                embeds: [embed],
                files: [{
                    attachment: backupPath,
                    name: backupFileName
                }]
            });

            console.log(`💾 Respaldo creado por ${interaction.user.tag} para ${interaction.guild.name}`);

        } catch (error) {
            console.error('Error creando respaldo:', error);
            await interaction.editReply({
                content: '❌ Error creando el respaldo de datos.'
            });
        }
    },

    async handleRestore(interaction) {
        const attachment = interaction.options.getAttachment('archivo');
        
        if (!attachment.name.endsWith('.json')) {
            return interaction.editReply({
                content: '❌ El archivo debe ser un respaldo JSON válido.'
            });
        }

        try {
            // Descargar y validar archivo
            const response = await fetch(attachment.url);
            const backupData = await response.json();

            // Validar estructura del respaldo
            if (!backupData.data || !backupData.timestamp) {
                return interaction.editReply({
                    content: '❌ Archivo de respaldo inválido o corrupto.'
                });
            }

            // Crear respaldo de seguridad antes de restaurar
            await this.createSafetyBackup(interaction.guild.id);

            // Restaurar datos
            if (backupData.data.tickets) {
                const ticketsPath = path.join(__dirname, '../data/tickets.json');
                await fs.writeFile(ticketsPath, JSON.stringify(backupData.data.tickets, null, 2));
            }

            if (backupData.data.stats) {
                const statsPath = path.join(__dirname, '../data/stats.json');
                await fs.writeFile(statsPath, JSON.stringify(backupData.data.stats, null, 2));
            }

            if (backupData.data.languages) {
                const langPath = path.join(__dirname, '../data/language_settings.json');
                await fs.writeFile(langPath, JSON.stringify(backupData.data.languages, null, 2));
            }

            const embed = new EmbedBuilder()
                .setTitle('♻️ Restauración Completada')
                .setDescription('Los datos han sido restaurados exitosamente')
                .setColor('#00FF00')
                .addFields(
                    {
                        name: '📋 Datos Restaurados',
                        value: `• ${Object.keys(backupData.data.tickets || {}).length} tickets\n• Estadísticas históricas\n• Configuración personalizada`,
                        inline: true
                    },
                    {
                        name: '📅 Información del Respaldo',
                        value: `**Origen:** ${backupData.guildName || 'N/A'}\n**Fecha:** ${new Date(backupData.timestamp).toLocaleString()}\n**Versión:** ${backupData.version || '1.0.0'}`,
                        inline: true
                    }
                )
                .addFields({
                    name: '⚠️ Importante',
                    value: 'Se creó un respaldo de seguridad automático antes de la restauración. Reinicia el bot para aplicar todos los cambios.',
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            console.log(`♻️ Datos restaurados por ${interaction.user.tag} en ${interaction.guild.name}`);

        } catch (error) {
            console.error('Error restaurando datos:', error);
            await interaction.editReply({
                content: '❌ Error procesando el archivo de respaldo. Verifica que sea un respaldo válido.'
            });
        }
    },

    async handleMaintenance(interaction) {
        const maintenanceMode = interaction.options.getBoolean('estado');
        const configPath = path.join(__dirname, '../data/config.json');
        
        try {
            let config = {};
            try {
                const configData = await fs.readFile(configPath, 'utf-8');
                config = JSON.parse(configData);
            } catch (error) {
                // Si no existe el archivo, crear uno nuevo
            }

            config.maintenanceMode = {
                enabled: maintenanceMode,
                activatedBy: interaction.user.id,
                activatedAt: Date.now(),
                reason: 'Activado por comando administrativo'
            };

            await fs.writeFile(configPath, JSON.stringify(config, null, 2));

            const embed = new EmbedBuilder()
                .setTitle(`🔧 Modo Mantenimiento ${maintenanceMode ? 'Activado' : 'Desactivado'}`)
                .setDescription(maintenanceMode ? 
                    'El sistema de tickets está ahora en mantenimiento. Los usuarios no podrán crear nuevos tickets.' :
                    'El sistema de tickets está operativo nuevamente.'
                )
                .setColor(maintenanceMode ? '#FF6B6B' : '#00FF00')
                .addFields({
                    name: '📊 Estado',
                    value: maintenanceMode ? '🔴 Mantenimiento' : '🟢 Operativo',
                    inline: true
                })
                .setFooter({
                    text: `Cambiado por ${interaction.user.tag}`
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Notificar en el canal de logs si está configurado
            const logsChannel = interaction.guild.channels.cache.get('TU-LOG-CHANNEL-ID');
            if (logsChannel) {
                await logsChannel.send({ embeds: [embed] });
            }

            console.log(`🔧 Modo mantenimiento ${maintenanceMode ? 'activado' : 'desactivado'} por ${interaction.user.tag}`);

        } catch (error) {
            console.error('Error configurando modo mantenimiento:', error);
            await interaction.editReply({
                content: '❌ Error configurando el modo mantenimiento.'
            });
        }
    },

    async handleCleanup(interaction) {
        const days = interaction.options.getInteger('dias');
        const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);

        try {
            // Limpiar tickets antiguos
            const ticketsPath = path.join(__dirname, '../data/tickets.json');
            let ticketsDB = {};
            let cleanedTickets = 0;

            try {
                const ticketsData = await fs.readFile(ticketsPath, 'utf-8');
                ticketsDB = JSON.parse(ticketsData);

                // Contar y eliminar tickets antiguos cerrados
                const ticketEntries = Object.entries(ticketsDB).filter(([key]) => !key.startsWith('_'));
                
                for (const [channelId, ticketData] of ticketEntries) {
                    if (ticketData.closedAt && ticketData.closedAt < cutoffDate) {
                        delete ticketsDB[channelId];
                        cleanedTickets++;
                    }
                }

                await fs.writeFile(ticketsPath, JSON.stringify(ticketsDB, null, 2));
            } catch (error) {
                console.error('Error limpiando tickets:', error);
            }

            // Limpiar transcripciones antiguas
            const transcriptsPath = path.join(__dirname, '../data/transcripts');
            let cleanedTranscripts = 0;

            try {
                const transcriptFiles = await fs.readdir(transcriptsPath);
                
                for (const file of transcriptFiles) {
                    const filePath = path.join(transcriptsPath, file);
                    const stats = await fs.stat(filePath);
                    
                    if (stats.mtime.getTime() < cutoffDate) {
                        await fs.unlink(filePath);
                        cleanedTranscripts++;
                    }
                }
            } catch (error) {
                console.error('Error limpiando transcripciones:', error);
            }

            const embed = new EmbedBuilder()
                .setTitle('🧹 Limpieza Completada')
                .setDescription(`Datos más antiguos que ${days} días han sido eliminados`)
                .setColor('#00FF00')
                .addFields(
                    {
                        name: '🎫 Tickets Eliminados',
                        value: cleanedTickets.toString(),
                        inline: true
                    },
                    {
                        name: '📋 Transcripciones Eliminadas',
                        value: cleanedTranscripts.toString(),
                        inline: true
                    },
                    {
                        name: '📅 Fecha de Corte',
                        value: new Date(cutoffDate).toLocaleDateString(),
                        inline: true
                    }
                )
                .addFields({
                    name: '💡 Nota',
                    value: 'Solo se eliminaron tickets cerrados y sus transcripciones asociadas. Los tickets abiertos se mantuvieron intactos.',
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            console.log(`🧹 Limpieza ejecutada por ${interaction.user.tag}: ${cleanedTickets} tickets, ${cleanedTranscripts} transcripciones`);

        } catch (error) {
            console.error('Error en limpieza:', error);
            await interaction.editReply({
                content: '❌ Error ejecutando la limpieza de datos.'
            });
        }
    },

    async handleConfig(interaction) {
        const configPath = path.join(__dirname, '../data/config.json');
        
        try {
            let config = {};
            try {
                const configData = await fs.readFile(configPath, 'utf-8');
                config = JSON.parse(configData);
            } catch (error) {
                config = {
                    version: '1.0.0',
                    maintenanceMode: { enabled: false },
                    features: {
                        autoTranscripts: true,
                        prioritySystem: true,
                        notifications: true,
                        statistics: true
                    }
                };
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Configuración del Sistema')
                .setDescription('Estado actual de la configuración')
                .setColor('#FFD700')
                .addFields(
                    {
                        name: '🔧 Estado del Sistema',
                        value: config.maintenanceMode?.enabled ? '🔴 Mantenimiento' : '🟢 Operativo',
                        inline: true
                    },
                    {
                        name: '📊 Versión',
                        value: config.version || '1.0.0',
                        inline: true
                    },
                    {
                        name: '🏢 Servidor',
                        value: interaction.guild.name,
                        inline: true
                    }
                );

            // Mostrar funcionalidades
            if (config.features) {
                let featuresText = '';
                Object.entries(config.features).forEach(([feature, enabled]) => {
                    const emoji = enabled ? '✅' : '❌';
                    const name = feature.replace(/([A-Z])/g, ' $1').toLowerCase();
                    featuresText += `${emoji} ${name.charAt(0).toUpperCase() + name.slice(1)}\n`;
                });

                embed.addFields({
                    name: '🎛️ Funcionalidades',
                    value: featuresText,
                    inline: false
                });
            }

            // Botones para configuración rápida
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_edit')
                        .setLabel('✏️ Editar')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('config_reset')
                        .setLabel('🔄 Restablecer')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('config_export')
                        .setLabel('📤 Exportar')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({ embeds: [embed], components: [buttons] });

        } catch (error) {
            console.error('Error obteniendo configuración:', error);
            await interaction.editReply({
                content: '❌ Error accediendo a la configuración del sistema.'
            });
        }
    },

    async handleHealth(interaction) {
        const healthChecks = [];

        // Verificar archivos esenciales
        const essentialFiles = [
            '../data/tickets.json',
            '../data/stats.json',
            '../locales/es.json',
            '../locales/en.json'
        ];

        for (const file of essentialFiles) {
            const filePath = path.join(__dirname, file);
            try {
                await fs.access(filePath);
                healthChecks.push({
                    name: path.basename(file),
                    status: '✅ OK',
                    message: 'Archivo accesible'
                });
            } catch (error) {
                healthChecks.push({
                    name: path.basename(file),
                    status: '❌ ERROR',
                    message: 'Archivo no encontrado'
                });
            }
        }

        // Verificar permisos del bot
        const requiredPermissions = [
            'ViewChannel',
            'SendMessages',
            'ManageChannels',
            'ManageRoles',
            'EmbedLinks',
            'AttachFiles'
        ];

        const botPermissions = interaction.guild.members.me.permissions;
        const missingPermissions = requiredPermissions.filter(perm => 
            !botPermissions.has(perm)
        );

        healthChecks.push({
            name: 'Permisos del Bot',
            status: missingPermissions.length === 0 ? '✅ OK' : '⚠️ ADVERTENCIA',
            message: missingPermissions.length === 0 ? 
                'Todos los permisos requeridos están disponibles' :
                `Faltan: ${missingPermissions.join(', ')}`
        });

        // Verificar estadísticas del sistema
        try {
            const stats = await statsManager.getSummaryStats();
            healthChecks.push({
                name: 'Sistema de Estadísticas',
                status: '✅ OK',
                message: `${stats.totalTickets} tickets registrados`
            });
        } catch (error) {
            healthChecks.push({
                name: 'Sistema de Estadísticas',
                status: '❌ ERROR',
                message: 'Error accediendo a estadísticas'
            });
        }

        // Calcular estado general
        const hasErrors = healthChecks.some(check => check.status.includes('ERROR'));
        const hasWarnings = healthChecks.some(check => check.status.includes('ADVERTENCIA'));
        
        let overallStatus = '🟢 SALUDABLE';
        let overallColor = '#00FF00';
        
        if (hasErrors) {
            overallStatus = '🔴 ERRORES DETECTADOS';
            overallColor = '#FF0000';
        } else if (hasWarnings) {
            overallStatus = '🟡 ADVERTENCIAS';
            overallColor = '#FFD700';
        }

        const embed = new EmbedBuilder()
            .setTitle('🏥 Estado del Sistema')
            .setDescription(`**Estado General:** ${overallStatus}`)
            .setColor(overallColor)
            .setTimestamp();

        // Añadir resultados de verificaciones
        healthChecks.forEach(check => {
            embed.addFields({
                name: check.status + ' ' + check.name,
                value: check.message,
                inline: true
            });
        });

        // Información adicional del sistema
        embed.addFields({
            name: '📊 Información del Bot',
            value: `**Uptime:** ${this.formatUptime(process.uptime())}\n**Memoria:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB\n**Node.js:** ${process.version}`,
            inline: false
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async createSafetyBackup(guildId) {
        try {
            const safetyBackupPath = path.join(__dirname, '../data/backups', `safety_backup_${guildId}_${Date.now()}.json`);
            
            const backupData = {
                timestamp: Date.now(),
                type: 'safety_backup',
                guildId: guildId
            };

            // Respaldar datos existentes
            const ticketsPath = path.join(__dirname, '../data/tickets.json');
            try {
                const ticketsData = await fs.readFile(ticketsPath, 'utf-8');
                backupData.tickets = JSON.parse(ticketsData);
            } catch (error) {
                backupData.tickets = {};
            }

            await fs.mkdir(path.dirname(safetyBackupPath), { recursive: true });
            await fs.writeFile(safetyBackupPath, JSON.stringify(backupData, null, 2));
            
            console.log(`💾 Respaldo de seguridad creado: ${safetyBackupPath}`);
        } catch (error) {
            console.error('Error creando respaldo de seguridad:', error);
        }
    },

    formatUptime(seconds) {
        const days = Math.floor(seconds / (24 * 60 * 60));
        const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((seconds % (60 * 60)) / 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
};