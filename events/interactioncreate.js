/*
 * Sistema Profesional de Tickets Avanzado
 * Versión 2.0 - Con todas las funcionalidades empresariales
 */

const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    PermissionsBitField,
    ChannelType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// Importar sistemas profesionales
const languageManager = require('../utils/LanguageManager');
const transcriptManager = require('../utils/TranscriptManager');
const priorityManager = require('../utils/PriorityManager');
const notificationManager = require('../utils/NotificationManager');
const statsManager = require('../utils/StatsManager');

// Configuración de rutas y directorios
const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'tickets.json');

// Configuración del servidor (Actualízala con tus IDs)
const CONFIG = {
    CATEGORIES: {
        soporte: '1401200019897581578',
        reporte: '1401200088440639528',
        pregunta: '1401200050356359319',
        billing: '1401200050356359320',  // Nueva categoría
        feature: '1401200050356359321'   // Nueva categoría
    },
    STAFF_ROLES: ['TUS-IDS-DE-STAFF-PUEDES-AGREGAR-MAS', 'MUCHOS-MAS'],
    LOGS_CHANNEL: 'TU-LOG-CHANNEL-ID',
    MAX_TICKETS_PER_DAY: 3,  // Incrementado
    TICKET_CLOSE_DELAY: 5000
};

// Base de datos mejorada
let ticketsDB = {
    _blacklist: {},
    _stats: {},
    _lastId: 0,
    _config: {
        maintenanceMode: false,
        autoTranscripts: true,
        notificationsEnabled: true
    }
};

let isDatabaseReady = false;

/**
 * Carga la base de datos con mejor manejo de errores
 */
async function loadDatabase() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }

    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        const loadedData = JSON.parse(data);
        
        // Merge con estructura por defecto
        ticketsDB = {
            ...ticketsDB,
            ...loadedData,
            _config: { ...ticketsDB._config, ...loadedData._config }
        };
        
        isDatabaseReady = true;
        console.log('✅ Base de datos profesional cargada correctamente');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error al cargar la base de datos:', error);
        }
        isDatabaseReady = true;
    }
}

/**
 * Guarda la base de datos con mejor manejo
 */
async function saveDatabase() {
    if (!isDatabaseReady) return;
    
    try {
        await fs.writeFile(DB_PATH, JSON.stringify(ticketsDB, null, 2));
    } catch (error) {
        console.error('Error al guardar la base de datos:', error);
    }
}

/**
 * Verifica si un usuario es staff
 */
function isStaff(member) {
    return member?.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
           member?.roles.cache.some(role => CONFIG.STAFF_ROLES.includes(role.id));
}

/**
 * Verifica si un usuario está en blacklist
 */
function isBlacklisted(userId) {
    return Boolean(ticketsDB._blacklist?.[userId]);
}

/**
 * Verifica si se puede crear un ticket
 */
function canCreateTicket(userId) {
    if (!isDatabaseReady) {
        return 'Sistema iniciando. Espera unos momentos.';
    }

    if (ticketsDB._config?.maintenanceMode) {
        return 'Sistema en mantenimiento. Intenta más tarde.';
    }

    if (isBlacklisted(userId)) {
        return 'Estás en la blacklist y no puedes crear tickets.';
    }

    // Verificar tickets abiertos
    const hasOpenTicket = Object.entries(ticketsDB)
        .filter(([key]) => !key.startsWith('_'))
        .some(([_, data]) => data.userId === userId && data.isOpen);

    if (hasOpenTicket) {
        return 'Ya tienes un ticket abierto. Cierra el anterior primero.';
    }

    // Verificar límite diario
    const today = new Date().toISOString().slice(0, 10);
    const userStats = ticketsDB._stats[userId] || {};

    if (userStats.lastCreated === today && userStats.count >= CONFIG.MAX_TICKETS_PER_DAY) {
        return `Solo puedes crear ${CONFIG.MAX_TICKETS_PER_DAY} tickets por día.`;
    }

    return null;
}

/**
 * Genera nombre de canal mejorado
 */
function generateChannelName(username, priority = 'medium') {
    const priorityEmoji = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢'
    };
    
    const baseName = username.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 15);
    
    return `${priorityEmoji[priority]}-ticket-${baseName}`;
}

/**
 * Crea un canal de ticket con configuración avanzada
 */
async function createTicketChannel(guild, user, category, description, priority = 'medium') {
    const categoryId = CONFIG.CATEGORIES[category];
    if (!categoryId) {
        throw new Error('Categoría inválida');
    }

    const channelName = generateChannelName(user.username, priority);
    const priorityConfig = priorityManager.getPriorityConfig(priority);
    
    const overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
            id: user.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles
            ]
        },
        ...CONFIG.STAFF_ROLES.map(id => ({
            id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.ManageMessages
            ]
        }))
    ];

    return guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: overwrites,
        topic: `Ticket: ${user.tag} | Prioridad: ${priorityConfig.name} | Creado: ${new Date().toLocaleString()}`
    });
}

/**
 * Crea embed profesional para tickets
 */
function createTicketEmbed(user, ticketId, description, priority, guild) {
    const lang = languageManager.getLanguage(guild.id, user.id);
    const priorityConfig = priorityManager.getPriorityConfig(priority);
    
    return new EmbedBuilder()
        .setTitle(`🎫 ${languageManager.get('tickets.new_ticket', guild.id, user.id)}`)
        .addFields(
            { 
                name: languageManager.get('tickets.user', guild.id, user.id), 
                value: `<@${user.id}>`, 
                inline: true 
            },
            { 
                name: languageManager.get('tickets.id', guild.id, user.id), 
                value: ticketId, 
                inline: true 
            },
            { 
                name: languageManager.get('tickets.priority', guild.id, user.id), 
                value: `${priorityConfig.emoji} ${priorityConfig.name}`, 
                inline: true 
            },
            { 
                name: languageManager.get('tickets.created_at', guild.id, user.id), 
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: false
            },
            { 
                name: languageManager.get('tickets.description', guild.id, user.id), 
                value: description.length > 1000 ? description.substring(0, 1000) + '...' : description,
                inline: false
            }
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setColor(priorityConfig.color)
        .setFooter({ 
            text: languageManager.get('tickets.footer', guild.id, user.id)
        })
        .setTimestamp();
}

/**
 * Crea botones avanzados para tickets
 */
function createAdvancedTicketButtons(guild) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel(`🎟️ ${languageManager.get('tickets.buttons.claim', guild.id)}`)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('add_user')
            .setLabel(`➕ ${languageManager.get('tickets.buttons.add_user', guild.id)}`)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('priority_change')
            .setLabel(`⚡ ${languageManager.get('tickets.buttons.priority', guild.id)}`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel(`🔴 ${languageManager.get('tickets.buttons.close', guild.id)}`)
            .setStyle(ButtonStyle.Danger)
    );
}

/**
 * Cierra un ticket con transcripción avanzada
 */
async function closeTicket(channel, closer, reason) {
    const ticketData = ticketsDB[channel.id];
    if (!ticketData || !ticketData.isOpen) return;

    try {
        // Generar transcripción avanzada
        const transcriptData = await transcriptManager.generateAdvancedTranscript(channel, ticketData);
        
        // Actualizar datos del ticket
        ticketData.closedAt = Date.now();
        ticketData.isOpen = false;
        ticketData.closedBy = closer.id;
        ticketData.reason = reason;
        ticketData.transcriptData = transcriptData;

        // Registrar en estadísticas
        await statsManager.recordTicketClosed(ticketData);

        // Notificar cierre
        await notificationManager.notifyTicketClosed(ticketData, closer, channel.guild, reason);

        // Crear embed de logs profesional
        const duration = ticketData.closedAt - ticketData.createdAt;
        const embed = new EmbedBuilder()
            .setTitle('📁 Ticket Cerrado Profesionalmente')
            .addFields(
                { name: 'Canal', value: channel.name, inline: true },
                { name: 'Usuario', value: `<@${ticketData.userId}>`, inline: true },
                { name: 'Cerrado por', value: `<@${closer.id}>`, inline: true },
                { name: 'Prioridad', value: `${priorityManager.getPriorityConfig(ticketData.priority).emoji} ${ticketData.priority}`, inline: true },
                { name: 'Duración', value: formatDuration(duration), inline: true },
                { name: 'Categoría', value: ticketData.category, inline: true },
                { name: 'Razón', value: reason || 'No especificada', inline: false },
                { name: 'Resumen IA', value: transcriptData.summary.quickSummary || 'No disponible', inline: false }
            )
            .setColor('#FF0000')
            .setTimestamp();

        // Enviar a logs con transcripción
        const logsChannel = channel.guild.channels.cache.get(CONFIG.LOGS_CHANNEL);
        if (logsChannel) {
            await logsChannel.send({ embeds: [embed] });
            
            // Enviar archivos de transcripción
            if (transcriptData.formats.html) {
                await logsChannel.send({
                    content: `📎 Transcripción HTML del ticket **${channel.name}**`,
                    files: [{ 
                        attachment: Buffer.from(transcriptData.formats.html.attachment), 
                        name: `${channel.name}.html` 
                    }]
                });
            }
        }

        await saveDatabase();

        // Mensaje de cierre
        await channel.send('🔒 Este ticket será eliminado en breve. ¡Gracias por usar nuestro sistema profesional!');
        setTimeout(() => channel.delete().catch(console.error), CONFIG.TICKET_CLOSE_DELAY);

    } catch (error) {
        console.error('Error en cierre profesional de ticket:', error);
        // Fallback al cierre básico
        await channel.send('❌ Error en transcripción avanzada, pero el ticket se cerrará normalmente.');
        setTimeout(() => channel.delete().catch(console.error), CONFIG.TICKET_CLOSE_DELAY);
    }
}

/**
 * Formatea duración en texto legible
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

// Cargar base de datos al inicio
loadDatabase().catch(console.error);

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            // Verificar permisos del bot
            if (!interaction.guild?.members.me?.permissions.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ManageRoles
            ])) {
                return interaction.reply({
                    content: '❌ El bot no tiene los permisos necesarios.',
                    ephemeral: true
                });
            }

            if (!interaction.inGuild()) return;

            const { user, guild, channel, member } = interaction;

            // MANEJO DE SELECCIÓN DE CATEGORÍA
            if (interaction.isStringSelectMenu() && interaction.customId === 'menu_categoria') {
                const error = canCreateTicket(user.id);
                if (error) {
                    return interaction.reply({ 
                        content: `❌ ${error}`, 
                        ephemeral: true
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`ticket_modal_${interaction.values[0]}`)
                    .setTitle('📝 Crear Ticket Profesional');

                const descriptionInput = new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('¿En qué podemos ayudarte?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Describe detalladamente tu situación...')
                    .setRequired(true)
                    .setMaxLength(1000);

                modal.addComponents(new ActionRowBuilder().addComponents(descriptionInput));
                return await interaction.showModal(modal);
            }

            // MANEJO DE MODAL DE TICKET
            if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
                const error = canCreateTicket(user.id);
                if (error) {
                    return interaction.reply({ 
                        content: `❌ ${error}`, 
                        ephemeral: true
                    });
                }

                const category = interaction.customId.split('_')[2];
                const description = interaction.fields.getTextInputValue('description');

                // Detectar prioridad automáticamente
                const detectedPriority = priorityManager.detectPriority(description, category);

                try {
                    const ticketChannel = await createTicketChannel(guild, user, category, description, detectedPriority);
                    const ticketId = `T-${Date.now()}`;

                    // Registrar ticket con datos avanzados
                    ticketsDB[ticketChannel.id] = {
                        id: ticketId,
                        userId: user.id,
                        category,
                        description,
                        priority: detectedPriority,
                        createdAt: Date.now(),
                        isOpen: true,
                        claimedBy: null,
                        claimedAt: null,
                        channelId: ticketChannel.id
                    };

                    // Actualizar estadísticas
                    const today = new Date().toISOString().slice(0, 10);
                    if (!ticketsDB._stats[user.id]) {
                        ticketsDB._stats[user.id] = { count: 0 };
                    }
                    ticketsDB._stats[user.id].lastCreated = today;
                    ticketsDB._stats[user.id].count += 1;

                    await saveDatabase();

                    // Registrar en sistema de estadísticas
                    await statsManager.recordTicketCreated(ticketsDB[ticketChannel.id]);

                    // Enviar mensaje profesional al canal
                    await ticketChannel.send({
                        content: `<@&${CONFIG.STAFF_ROLES.join('> <@&')}> - Nuevo ticket de prioridad ${priorityManager.getPriorityConfig(detectedPriority).emoji}`,
                        embeds: [createTicketEmbed(user, ticketId, description, detectedPriority, guild)],
                        components: [createAdvancedTicketButtons(guild)]
                    });

                    // Notificar al sistema
                    await notificationManager.notifyNewTicket(ticketsDB[ticketChannel.id], guild, ticketChannel);

                    return interaction.reply({
                        content: `✅ Tu ticket profesional ha sido creado: ${ticketChannel}\n🔥 Prioridad detectada: ${priorityManager.getPriorityConfig(detectedPriority).emoji} ${detectedPriority.toUpperCase()}`,
                        ephemeral: true
                    });

                } catch (error) {
                    console.error('Error creando ticket profesional:', error);
                    return interaction.reply({
                        content: '❌ Error creando el ticket. Intenta nuevamente.',
                        ephemeral: true
                    });
                }
            }

            // MANEJO DE BOTONES
            if (interaction.isButton()) {
                const ticketData = ticketsDB[channel.id];
                
                switch (interaction.customId) {
                    case 'claim_ticket':
                        if (!isStaff(member)) {
                            return interaction.reply({
                                content: '❌ Solo el staff puede reclamar tickets.',
                                ephemeral: true
                            });
                        }

                        if (!ticketData?.isOpen) {
                            return interaction.reply({
                                content: '❌ Ticket no válido o cerrado.',
                                ephemeral: true
                            });
                        }

                        if (ticketData.claimedBy) {
                            return interaction.reply({
                                content: `❌ Ya reclamado por <@${ticketData.claimedBy}>.`,
                                ephemeral: true
                            });
                        }

                        ticketData.claimedBy = user.id;
                        ticketData.claimedAt = Date.now();
                        await saveDatabase();

                        await statsManager.recordTicketClaimed(ticketData, user.id);
                        await notificationManager.notifyTicketClaimed(ticketData, user, guild);

                        return interaction.reply({
                            content: `🎟️ Has reclamado este ticket profesionalmente.`,
                            ephemeral: false
                        });

                    case 'priority_change':
                        if (!isStaff(member)) {
                            return interaction.reply({
                                content: '❌ Solo el staff puede cambiar prioridades.',
                                ephemeral: true
                            });
                        }

                        const priorityMenu = new StringSelectMenuBuilder()
                            .setCustomId('priority_select')
                            .setPlaceholder('Selecciona nueva prioridad')
                            .addOptions(
                                { label: '🔴 CRÍTICA', value: 'critical', description: 'Máxima urgencia' },
                                { label: '🟠 ALTA', value: 'high', description: 'Alta prioridad' },
                                { label: '🟡 MEDIA', value: 'medium', description: 'Prioridad normal' },
                                { label: '🟢 BAJA', value: 'low', description: 'Baja prioridad' }
                            );

                        const row = new ActionRowBuilder().addComponents(priorityMenu);
                        return interaction.reply({
                            content: 'Selecciona la nueva prioridad:',
                            components: [row],
                            ephemeral: true
                        });

                        case 'close_ticket':
                        if (!isStaff(member)) {
                            return interaction.reply({
                                content: '❌ Solo el staff puede cerrar tickets.',
                                ephemeral: true
                            });
                        }

                        const closeModal = new ModalBuilder()
                            .setCustomId('close_ticket_modal')
                            .setTitle('Cerrar Ticket - Razón');

                        const reasonInput = new TextInputBuilder()
                            .setCustomId('reason')
                            .setLabel('Razón para cerrar el ticket')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);

                        closeModal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                        return interaction.showModal(closeModal);
                }
            }

            // MANEJO DE CAMBIO DE PRIORIDAD
            if (interaction.isStringSelectMenu() && interaction.customId === 'priority_select') {
                if (!isStaff(member)) {
                    return interaction.reply({
                        content: '❌ Solo el staff puede cambiar prioridades.',
                        ephemeral: true
                    });
                }

                const ticketData = ticketsDB[channel.id];
                if (!ticketData) {
                    return interaction.reply({
                        content: '❌ Datos del ticket no encontrados.',
                        ephemeral: true
                    });
                }

                const newPriority = interaction.values[0];
                const oldPriority = ticketData.priority;
                const priorityConfig = priorityManager.getPriorityConfig(newPriority);

                ticketData.priority = newPriority;
                ticketData.priorityChangedAt = Date.now();
                ticketData.priorityChangedBy = user.id;

                await saveDatabase();

                const embed = new EmbedBuilder()
                    .setTitle('⚡ Prioridad Actualizada')
                    .setDescription(`Prioridad cambiada de ${oldPriority} a ${newPriority}`)
                    .setColor(priorityConfig.color)
                    .addFields(
                        { name: 'Nueva Prioridad', value: `${priorityConfig.emoji} ${priorityConfig.name}`, inline: true },
                        { name: 'SLA', value: `${priorityConfig.slaHours} horas`, inline: true },
                        { name: 'Modificado por', value: `<@${user.id}>`, inline: true }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // MANEJO DE MODAL DE CIERRE
            if (interaction.isModalSubmit() && interaction.customId === 'close_ticket_modal') {
                if (!isStaff(member)) {
                    return interaction.reply({
                        content: '❌ Solo el staff puede cerrar tickets.',
                        ephemeral: true
                    });
                }

                const reason = interaction.fields.getTextInputValue('reason');

                try {
                    await closeTicket(channel, user, reason);
                    await interaction.reply({
                        content: '✅ El ticket se está cerrando con transcripción avanzada.',
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error cerrando ticket:', error);
                    await interaction.reply({
                        content: '❌ Error al cerrar el ticket.',
                        ephemeral: true
                    });
                }
            }

        } catch (error) {
            console.error('Error en interactionCreate profesional:', error);

            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ Error inesperado en el sistema profesional.',
                        ephemeral: true
                    });
                } catch (innerError) {
                    console.error('Error respondiendo:', innerError);
                }
            }
        }
    }
};