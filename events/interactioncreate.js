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
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    PermissionsBitField,
    ChannelType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { createTranscript } = require('discord-html-transcripts');

// Configuración de rutas y directorios
const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'tickets.json');
const TRANSCRIPTS_DIR = path.join(DATA_DIR, 'ticket_transcripts');

// Configuración del servidor (actualizala para coincidir con los valores del menú)
const CONFIG = {
    CATEGORIES: {
        soporte: '1401200019897581578',  // Cambia por tus ids correctos
        reporte: '1401200088440639528',  
        pregunta: '1401200050356359319'  
    },
    STAFF_ROLES: ['TUS-IDS-DE-STAFF-PUEDES-AGREGAR-MAS', 'MUCHOS-MAS'],
    LOGS_CHANNEL: 'TU-LOG-CHANNEL-ID',
    MAX_TICKETS_PER_DAY: 1,
    TICKET_CLOSE_DELAY: 5000 // 5 segundos
};

// Inicialización de la base de datos
let ticketsDB = {
    _blacklist: {},
    _stats: {},
    _lastId: 0
};

// Variable para controlar si la base de datos está lista
let isDatabaseReady = false;

/**
 * Carga la base de datos desde el archivo
 */
async function loadDatabase() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR);
    }

    try {
        await fs.access(TRANSCRIPTS_DIR);
    } catch {
        await fs.mkdir(TRANSCRIPTS_DIR);
    }

    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        ticketsDB = JSON.parse(data);
        
        // Asegurar que las estructuras básicas existan
        ticketsDB._blacklist = ticketsDB._blacklist || {};
        ticketsDB._stats = ticketsDB._stats || {};
        ticketsDB._lastId = ticketsDB._lastId || 0;
        
        isDatabaseReady = true;
        console.log('✅ Base de datos de tickets cargada correctamente');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error al cargar la base de datos:', error);
        }
        isDatabaseReady = true; // Continuar aunque falle
    }
}

/**
 * Guarda la base de datos en el archivo
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
 * @param {GuildMember} member 
 * @returns {boolean}
 */
function isStaff(member) {
    return member?.roles.cache.some(role => CONFIG.STAFF_ROLES.includes(role.id));
}

/**
 * Verifica si un usuario está en la blacklist
 * @param {string} userId 
 * @returns {boolean}
 */
function isBlacklisted(userId) {
    if (!ticketsDB._blacklist) {
        console.error('La blacklist no está inicializada');
        ticketsDB._blacklist = {};
        return false;
    }
    return Boolean(ticketsDB._blacklist[userId]);
}

/**
 * Verifica si un usuario puede crear un nuevo ticket
 * @param {string} userId 
 * @returns {string|null} Mensaje de error o null si puede crear
 */
function canCreateTicket(userId) {
    if (!isDatabaseReady) {
        return '❌ El sistema de tickets está iniciando. Por favor, intenta nuevamente en unos momentos.';
    }

    if (isBlacklisted(userId)) {
        return '❌ Estás en la blacklist y no puedes crear tickets.';
    }

    // Verificar tickets abiertos
    const hasOpenTicket = Object.entries(ticketsDB)
        .filter(([key]) => !key.startsWith('_'))
        .some(([_, data]) => data.userId === userId && data.isOpen);

    if (hasOpenTicket) {
        return '❌ Ya tienes un ticket abierto. Por favor cierra ese primero.';
    }

    // Verificar límite diario
    const today = new Date().toISOString().slice(0, 10);
    const userStats = ticketsDB._stats[userId] || {};

    if (userStats.lastCreated === today &&
        userStats.count >= CONFIG.MAX_TICKETS_PER_DAY) {
        return `❌ Solo puedes crear ${CONFIG.MAX_TICKETS_PER_DAY} ticket(s) por día.`;
    }

    return null;
}

/**
 * Genera un nombre seguro para el canal
 * @param {string} username 
 * @returns {string}
 */
function generateChannelName(username) {
    return `ticket-${username.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 20)}`;
}

/**
 * Crea un nuevo ticket en el servidor
 * @param {Guild} guild 
 * @param {User} user 
 * @param {string} category 
 * @param {string} description 
 * @returns {Promise<TextChannel>}
 */
async function createTicketChannel(guild, user, category, description) {
    const categoryId = CONFIG.CATEGORIES[category];
    if (!categoryId) {
        console.error(`Categoría no encontrada: ${category}`);
        throw new Error('Categoría inválida');
    }

    const channelName = generateChannelName(user.username);
    const overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
            id: user.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
            ]
        },
        ...CONFIG.STAFF_ROLES.map(id => ({
            id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
            ]
        }))
    ];

    return guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: overwrites
    });
}

/**
 * Crea un embed para un nuevo ticket
 * @param {User} user 
 * @param {string} ticketId 
 * @param {string} description 
 * @returns {EmbedBuilder}
 */
function createTicketEmbed(user, ticketId, description) {
    return new EmbedBuilder()
        .setTitle('🎫 Nuevo ticket')
        .addFields(
            { name: '🧑 Usuario', value: `<@${user.id}>`, inline: true },
            { name: '🆔 ID del Ticket', value: ticketId, inline: true },
            { name: '🕒 Creado', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
            { name: '📃 Descripción', value: description }
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setColor('DarkButNotBlack')
        .setFooter({ text: 'Un staff se pondrá en contacto contigo pronto.' });
}

/**
 * Crea los botones para un ticket
 * @returns {ActionRowBuilder}
 */
function createTicketButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('🎟️ Reclamar')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('add_user')
            .setLabel('➕ Añadir Usuario')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('🔴 Cerrar Ticket')
            .setStyle(ButtonStyle.Danger)
    );
}

/**
 * Cierra un ticket y genera la transcripción
 * @param {TextChannel} channel 
 * @param {User} closer 
 * @param {string} reason 
 * @returns {Promise<void>}
 */
async function closeTicket(channel, closer, reason) {
    const ticketData = ticketsDB[channel.id];
    if (!ticketData || !ticketData.isOpen) return;

    // Generar transcripción
    const transcript = await createTranscript(channel, {
        fileName: `${channel.name}.html`,
        saveImages: true,
        poweredBy: false
    });

    const transcriptPath = path.join(TRANSCRIPTS_DIR, `${channel.id}.html`);
    await fs.writeFile(transcriptPath, transcript.attachment);

    // Actualizar datos del ticket
    ticketData.closedAt = Date.now();
    ticketData.isOpen = false;
    ticketData.closedBy = closer.id;
    ticketData.reason = reason;
    ticketData.transcriptPath = transcriptPath;

    // Calcular duración
    const created = ticketData.createdAt || Date.now();
    const closed = ticketData.closedAt || Date.now();
    const duration = Math.floor((closed - created) / 60000);

    // Crear embed de logs
    const logEmbed = new EmbedBuilder()
        .setTitle('📁 Ticket cerrado')
        .addFields(
            { name: 'Canal', value: channel.name, inline: true },
            { name: 'Usuario', value: `<@${ticketData.userId}>`, inline: true },
            { name: 'Cerrado por', value: `<@${closer.id}>`, inline: true },
            { name: 'Razón', value: reason || 'No especificada' },
            { name: 'Duración', value: `${duration} minutos`, inline: true }
        )
        .setColor('Red')
        .setTimestamp();

    // Botón para reabrir
    const reopenBtn = new ButtonBuilder()
        .setCustomId(`reopen_ticket_${channel.id}`)
        .setLabel('♻️ Reabrir Ticket')
        .setStyle(ButtonStyle.Primary);

    const btnRow = new ActionRowBuilder().addComponents(reopenBtn);

    // Enviar logs
    const logsChannel = channel.guild.channels.cache.get(CONFIG.LOGS_CHANNEL);
    if (logsChannel) {
        await logsChannel.send({
            embeds: [logEmbed],
            components: [btnRow]
        });
        await logsChannel.send({
            content: `📎 Transcripción del ticket **${channel.name}**`,
            files: [{ attachment: transcriptPath, name: `${channel.name}.html` }]
        });
    }

    // Notificar y eliminar canal
    await channel.send('🔒 Este ticket será eliminado en breve...');
    setTimeout(() => channel.delete().catch(console.error), CONFIG.TICKET_CLOSE_DELAY);
}

/**
 * Reabre un ticket cerrado
 * @param {Guild} guild 
 * @param {string} ticketId 
 * @param {User} reopener 
 * @returns {Promise<TextChannel>}
 */
async function reopenTicket(guild, ticketId, reopener) {
    const ticketData = ticketsDB[ticketId];
    if (!ticketData) throw new Error('Ticket no encontrado');
    if (ticketData.isOpen) throw new Error('El ticket ya está abierto');

    const user = await guild.client.users.fetch(ticketData.userId).catch(() => null);
    if (!user) throw new Error('El usuario que creó el ticket ya no está en el servidor');

    const channelName = generateChannelName(user.username);
    const overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
            id: user.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
            ]
        },
        ...CONFIG.STAFF_ROLES.map(id => ({
            id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
            ]
        }))
    ];

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: CONFIG.CATEGORIES.soporte, // Usar la categoría de soporte por defecto
        permissionOverwrites: overwrites
    });

    // Actualizar datos del ticket
    ticketData.isOpen = true;
    ticketData.reopenedAt = Date.now();
    ticketData.reopenedBy = reopener.id;
    ticketData.channelId = channel.id;
    delete ticketData.closedAt;
    delete ticketData.closedBy;

    await saveDatabase();

    // Enviar mensaje de reapertura
    await channel.send({
        content: `<@${user.id}> tu ticket ha sido reabierto.`,
        embeds: [
            new EmbedBuilder()
                .setTitle('♻️ Ticket Reabierto')
                .setDescription('Puedes continuar tu conversación con el staff.')
                .setColor('Green')
        ]
    });

    return channel;
}

// Cargar la base de datos al iniciar
loadDatabase().catch(console.error);

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            console.log(`[INTERACTION] Tipo: ${interaction.type}, ID: ${interaction.id}, CustomID: ${interaction.customId || 'N/A'}`);
            
            // Verificar permisos del bot primero
            if (!interaction.guild?.members.me?.permissions.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ManageRoles
            ])) {
                console.error('El bot no tiene los permisos necesarios');
                return interaction.reply({
                    content: '❌ El bot no tiene los permisos necesarios. Contacta a un administrador.',
                    ephemeral: true,
                    flags: 64
                });
            }

            // Verificar si la interacción es válida y en un servidor
            if (!interaction.inGuild()) {
                console.log('Interacción no en guild, ignorando');
                return;
            }

            const { user, guild, channel, member } = interaction;

            // Manejar selección de categoría (StringSelectMenuInteraction)
            if (interaction.isStringSelectMenu() && interaction.customId === 'menu_categoria') {
                console.log('Procesando selección de categoría de ticket');
                
                // Verificar si la base de datos está lista
                if (!isDatabaseReady) {
                    return interaction.reply({
                        content: '❌ El sistema de tickets está iniciando. Por favor, intenta nuevamente en unos momentos.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                const error = canCreateTicket(user.id);
                if (error) {
                    console.log(`Usuario no puede crear ticket: ${error}`);
                    return interaction.reply({ 
                        content: error, 
                        ephemeral: true,
                        flags: 64
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`ticket_modal_${interaction.values[0]}`)
                    .setTitle('📝 Crear Ticket');

                const input = new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('¿En qué podemos ayudarte?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Describe tu situación...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return await interaction.showModal(modal);
            }

            // Manejar envío de modal de ticket
            if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
                const error = canCreateTicket(user.id);
                if (error) return interaction.reply({ 
                    content: error, 
                    ephemeral: true,
                    flags: 64
                });

                const category = interaction.customId.split('_')[2];
                const description = interaction.fields.getTextInputValue('description');

                // Verificación adicional de categoría
                if (!CONFIG.CATEGORIES[category]) {
                    console.error(`Categoría no encontrada: ${category}`);
                    return interaction.reply({
                        content: '❌ Categoría de ticket no válida. Por favor, inténtalo de nuevo.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                try {
                    const ticketChannel = await createTicketChannel(guild, user, category, description);
                    const ticketId = `T-${Date.now()}`;

                    // Registrar ticket
                    ticketsDB[ticketChannel.id] = {
                        id: ticketId,
                        userId: user.id,
                        category,
                        description,
                        createdAt: Date.now(),
                        isOpen: true,
                        claimedBy: null,
                        claimedAt: null
                    };

                    // Actualizar estadísticas
                    const today = new Date().toISOString().slice(0, 10);
                    ticketsDB._stats[user.id] = ticketsDB._stats[user.id] || { count: 0 };
                    ticketsDB._stats[user.id].lastCreated = today;
                    ticketsDB._stats[user.id].count += 1;

                    await saveDatabase();

                    // Enviar mensaje de ticket
                    await ticketChannel.send({
                        content: `<@&${CONFIG.STAFF_ROLES.join('> <@&')}> - Nuevo ticket`,
                        embeds: [createTicketEmbed(user, ticketId, description)],
                        components: [createTicketButtons()]
                    });

                    return interaction.reply({
                        content: `✅ Tu ticket ha sido creado: ${ticketChannel}`,
                        ephemeral: true,
                        flags: 64
                    });
                } catch (error) {
                    console.error('Error al crear ticket:', error);
                    return interaction.reply({
                        content: '❌ Ocurrió un error al crear el ticket. Intenta nuevamente.',
                        ephemeral: true,
                        flags: 64
                    });
                }
            }

            // Manejar reclamación de ticket
            if (interaction.isButton() && interaction.customId === 'claim_ticket') {
                if (!isStaff(member)) {
                    return interaction.reply({
                        content: '❌ Solo el staff puede reclamar tickets.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                const ticketData = ticketsDB[channel.id];
                if (!ticketData || !ticketData.isOpen) {
                    return interaction.reply({
                        content: 'Este ticket no está registrado o ya está cerrado.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                if (ticketData.claimedBy) {
                    return interaction.reply({
                        content: `Este ticket ya fue reclamado por <@${ticketData.claimedBy}>.`,
                        ephemeral: true,
                        flags: 64
                    });
                }

                ticketData.claimedBy = user.id;
                ticketData.claimedAt = Date.now();
                await saveDatabase();

                return interaction.reply({
                    content: `🎟️ Has reclamado este ticket.`,
                    ephemeral: false
                });
            }

            // Manejar adición de usuario
            if (interaction.isButton() && interaction.customId === 'add_user') {
                if (!isStaff(member)) {
                    return interaction.reply({
                        content: '❌ Solo el staff puede añadir usuarios al ticket.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId('add_user_modal')
                    .setTitle('Añadir Usuario al Ticket');

                const userInput = new TextInputBuilder()
                    .setCustomId('user_id')
                    .setLabel('Menciona o coloca ID del usuario')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ejemplo: @usuario o 123456789012345678')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(userInput));
                return interaction.showModal(modal);
            }

            // Manejar envío de modal para añadir usuario
            if (interaction.isModalSubmit() && interaction.customId === 'add_user_modal') {
                if (!isStaff(member)) {
                    return interaction.reply({
                        content: '❌ Solo el staff puede añadir usuarios al ticket.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
                const targetMember = await guild.members.fetch(userId).catch(() => null);

                if (!targetMember) {
                    return interaction.reply({
                        content: '❌ No se encontró ese usuario en el servidor.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                const ticketData = ticketsDB[channel.id];
                if (!ticketData || !ticketData.isOpen) {
                    return interaction.reply({
                        content: 'Este canal no es un ticket abierto válido.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                const hasAccess = channel.permissionsFor(targetMember)?.has(
                    PermissionsBitField.Flags.ViewChannel
                );

                if (hasAccess) {
                    return interaction.reply({
                        content: 'Este usuario ya tiene acceso a este ticket.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                await channel.permissionOverwrites.edit(targetMember.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                });

                await interaction.reply({
                    content: `✅ Se añadió correctamente a <@${targetMember.id}> al ticket.`,
                    ephemeral: false
                });
                await channel.send(`➕ <@${targetMember.id}> fue añadido al ticket por <@${user.id}>.`);
            }

            // Manejar cierre de ticket
            if (interaction.isButton() && interaction.customId === 'close_ticket') {
                if (!isStaff(member)) {
                    return interaction.reply({
                        content: '❌ Solo el staff puede cerrar tickets.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId('close_ticket_modal')
                    .setTitle('Cerrar Ticket - Razón');

                const reasonInput = new TextInputBuilder()
                    .setCustomId('reason')
                    .setLabel('Razón para cerrar el ticket')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                return interaction.showModal(modal);
            }

            // Manejar envío de modal para cerrar ticket
            if (interaction.isModalSubmit() && interaction.customId === 'close_ticket_modal') {
                if (!isStaff(member)) {
                    return interaction.reply({
                        content: '❌ Solo el staff puede cerrar tickets.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                const reason = interaction.fields.getTextInputValue('reason');

                try {
                    await closeTicket(channel, user, reason);
                    await interaction.reply({
                        content: '✅ El ticket se está cerrando y fue registrado.',
                        ephemeral: true,
                        flags: 64
                    });
                } catch (error) {
                    console.error('Error al cerrar ticket:', error);
                    await interaction.reply({
                        content: '❌ Error al cerrar el ticket. Intenta nuevamente.',
                        ephemeral: true,
                        flags: 64
                    });
                }
            }

            // Manejar reapertura de ticket
            if (interaction.isButton() && interaction.customId.startsWith('reopen_ticket_')) {
                if (!isStaff(member)) {
                    return interaction.reply({
                        content: '❌ Solo el staff puede reabrir tickets.',
                        ephemeral: true,
                        flags: 64
                    });
                }

                const ticketId = interaction.customId.split('_')[2];

                try {
                    const newChannel = await reopenTicket(guild, ticketId, user);
                    await interaction.reply({
                        content: `✅ Ticket reabierto en ${newChannel}`,
                        ephemeral: true,
                        flags: 64
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ ${error.message}`,
                        ephemeral: true,
                        flags: 64
                    });
                }
            }

        } catch (error) {
            console.error('Error en interactionCreate:', error);

            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ Ocurrió un error inesperado. Intenta nuevamente más tarde.',
                        ephemeral: true,
                        flags: 64
                    });
                } catch (innerError) {
                    console.error('Error al responder a la interacción:', innerError);
                }
            }
        }
    }
};