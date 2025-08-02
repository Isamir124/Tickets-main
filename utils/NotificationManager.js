/*
 * NotificationManager - Sistema avanzado de notificaciones
 * Gestiona notificaciones automáticas, recordatorios y escalaciones
 */

const languageManager = require('./LanguageManager');

class NotificationManager {
    constructor() {
        this.pendingNotifications = new Map();
        this.escalationTimers = new Map();
        this.reminderTimers = new Map();
        
        // Configuración de notificaciones
        this.config = {
            staffInactivityMinutes: 30,
            customerReminderHours: 24,
            escalationLevels: [
                { minutes: 15, role: 'staff' },
                { minutes: 60, role: 'senior_staff' },
                { minutes: 240, role: 'manager' }
            ],
            webhookUrls: {
                // Configurar URLs de webhooks para integraciones externas
                slack: process.env.SLACK_WEBHOOK_URL,
                teams: process.env.TEAMS_WEBHOOK_URL,
                discord: process.env.DISCORD_WEBHOOK_URL
            }
        };
    }

    /**
     * Envía notificación de nuevo ticket al staff
     * @param {Object} ticketData 
     * @param {Guild} guild 
     * @param {TextChannel} channel 
     */
    async notifyNewTicket(ticketData, guild, channel) {
        try {
            const language = languageManager.getLanguage(guild.id);
            
            // Notificar por DM a roles específicos
            await this.notifyStaffMembers(guild, {
                title: languageManager.get('tickets.new_ticket', guild.id),
                description: `Nuevo ticket **${ticketData.id}** creado por <@${ticketData.userId}>`,
                priority: ticketData.priority,
                category: ticketData.category,
                channel: channel.toString(),
                url: `https://discord.com/channels/${guild.id}/${channel.id}`
            });

            // Enviar a webhooks externos
            await this.sendWebhookNotification('newTicket', {
                ticketId: ticketData.id,
                userId: ticketData.userId,
                priority: ticketData.priority,
                category: ticketData.category,
                description: ticketData.description,
                guildName: guild.name,
                channelUrl: `https://discord.com/channels/${guild.id}/${channel.id}`
            });

            // Programar escalación automática
            this.scheduleEscalation(ticketData.id, ticketData, guild);

        } catch (error) {
            console.error('Error enviando notificación de nuevo ticket:', error);
        }
    }

    /**
     * Notifica cuando un ticket es reclamado
     * @param {Object} ticketData 
     * @param {User} claimer 
     * @param {Guild} guild 
     */
    async notifyTicketClaimed(ticketData, claimer, guild) {
        try {
            // Cancelar escalación programada
            this.cancelEscalation(ticketData.id);

            // Notificar al creador del ticket
            const creator = await guild.client.users.fetch(ticketData.userId).catch(() => null);
            if (creator) {
                const embed = {
                    title: '🎟️ Tu ticket ha sido reclamado',
                    description: `El staff member **${claimer.displayName}** está revisando tu ticket.`,
                    color: '#00FF00',
                    fields: [
                        {
                            name: 'Ticket ID',
                            value: ticketData.id,
                            inline: true
                        },
                        {
                            name: 'Staff Asignado',
                            value: claimer.displayName,
                            inline: true
                        }
                    ],
                    timestamp: new Date().toISOString()
                };

                await creator.send({ embeds: [embed] }).catch(console.error);
            }

            // Webhook notification
            await this.sendWebhookNotification('ticketClaimed', {
                ticketId: ticketData.id,
                claimedBy: claimer.displayName,
                claimedAt: Date.now()
            });

        } catch (error) {
            console.error('Error enviando notificación de ticket reclamado:', error);
        }
    }

    /**
     * Notifica cuando un ticket es cerrado
     * @param {Object} ticketData 
     * @param {User} closer 
     * @param {Guild} guild 
     * @param {string} reason 
     */
    async notifyTicketClosed(ticketData, closer, guild, reason) {
        try {
            // Cancelar todos los timers relacionados
            this.cancelAllTimers(ticketData.id);

            // Notificar al creador
            const creator = await guild.client.users.fetch(ticketData.userId).catch(() => null);
            if (creator) {
                const embed = {
                    title: '✅ Tu ticket ha sido resuelto',
                    description: `Tu ticket **${ticketData.id}** ha sido cerrado exitosamente.`,
                    color: '#00FF00',
                    fields: [
                        {
                            name: 'Resuelto por',
                            value: closer.displayName,
                            inline: true
                        },
                        {
                            name: 'Razón',
                            value: reason || 'No especificada',
                            inline: false
                        }
                    ],
                    footer: {
                        text: 'Gracias por usar nuestro sistema de soporte'
                    },
                    timestamp: new Date().toISOString()
                };

                await creator.send({ embeds: [embed] }).catch(console.error);

                // Enviar encuesta de satisfacción después de 5 minutos
                setTimeout(() => {
                    this.sendSatisfactionSurvey(creator, ticketData);
                }, 5 * 60 * 1000);
            }

            // Webhook notification
            await this.sendWebhookNotification('ticketClosed', {
                ticketId: ticketData.id,
                closedBy: closer.displayName,
                reason: reason,
                duration: ticketData.closedAt - ticketData.createdAt
            });

        } catch (error) {
            console.error('Error enviando notificación de ticket cerrado:', error);
        }
    }

    /**
     * Programa escalación automática de tickets
     * @param {string} ticketId 
     * @param {Object} ticketData 
     * @param {Guild} guild 
     */
    scheduleEscalation(ticketId, ticketData, guild) {
        // Cancelar escalación existente
        this.cancelEscalation(ticketId);

        const priorityManager = require('./PriorityManager');
        const priority = priorityManager.getPriorityConfig(ticketData.priority || 'medium');

        // Programar escalación según la prioridad
        const escalationTime = priority.escalationMinutes * 60 * 1000;
        
        const timer = setTimeout(async () => {
            try {
                await this.escalateTicket(ticketId, ticketData, guild);
            } catch (error) {
                console.error('Error en escalación automática:', error);
            }
        }, escalationTime);

        this.escalationTimers.set(ticketId, timer);
        console.log(`⏰ Escalación programada para ticket ${ticketId} en ${priority.escalationMinutes} minutos`);
    }

    /**
     * Escala un ticket no atendido
     * @param {string} ticketId 
     * @param {Object} ticketData 
     * @param {Guild} guild 
     */
    async escalateTicket(ticketId, ticketData, guild) {
        try {
            // Buscar el canal del ticket
            const channel = guild.channels.cache.get(ticketData.channelId);
            if (!channel) return;

            // Crear embed de escalación
            const embed = {
                title: '🚨 ESCALACIÓN AUTOMÁTICA',
                description: `El ticket **${ticketId}** requiere atención inmediata.`,
                color: '#FF0000',
                fields: [
                    {
                        name: '⏱️ Tiempo sin respuesta',
                        value: this.formatDuration(Date.now() - ticketData.createdAt),
                        inline: true
                    },
                    {
                        name: '⚡ Prioridad',
                        value: (ticketData.priority || 'medium').toUpperCase(),
                        inline: true
                    },
                    {
                        name: '👤 Usuario',
                        value: `<@${ticketData.userId}>`,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            // Notificar en el canal
            await channel.send({
                content: `🚨 @everyone ESCALACIÓN AUTOMÁTICA - REQUIERE ATENCIÓN INMEDIATA`,
                embeds: [embed]
            });

            // Notificar a managers por DM
            await this.notifyManagers(guild, {
                title: '🚨 Escalación Automática',
                description: `Ticket ${ticketId} requiere atención inmediata`,
                ticketData,
                channelUrl: `https://discord.com/channels/${guild.id}/${channel.id}`
            });

            // Webhook notification
            await this.sendWebhookNotification('ticketEscalated', {
                ticketId,
                escalatedAt: Date.now(),
                reason: 'Tiempo de respuesta excedido'
            });

            // Marcar ticket como escalado
            ticketData.escalated = true;
            ticketData.escalatedAt = Date.now();

        } catch (error) {
            console.error('Error escalando ticket:', error);
        }
    }

    /**
     * Cancela la escalación de un ticket
     * @param {string} ticketId 
     */
    cancelEscalation(ticketId) {
        const timer = this.escalationTimers.get(ticketId);
        if (timer) {
            clearTimeout(timer);
            this.escalationTimers.delete(ticketId);
            console.log(`⏰ Escalación cancelada para ticket ${ticketId}`);
        }
    }

    /**
     * Cancela todos los timers de un ticket
     * @param {string} ticketId 
     */
    cancelAllTimers(ticketId) {
        this.cancelEscalation(ticketId);
        
        const reminderTimer = this.reminderTimers.get(ticketId);
        if (reminderTimer) {
            clearTimeout(reminderTimer);
            this.reminderTimers.delete(ticketId);
        }
    }

    /**
     * Notifica a miembros del staff
     * @param {Guild} guild 
     * @param {Object} notification 
     */
    async notifyStaffMembers(guild, notification) {
        try {
            const staffRoleIds = ['TUS-IDS-DE-STAFF-PUEDES-AGREGAR-MAS']; // Configurar roles de staff
            
            for (const roleId of staffRoleIds) {
                const role = guild.roles.cache.get(roleId);
                if (!role) continue;

                for (const member of role.members.values()) {
                    if (member.user.bot) continue;

                    const embed = {
                        title: notification.title,
                        description: notification.description,
                        color: this.getPriorityColor(notification.priority),
                        fields: [
                            {
                                name: '📂 Categoría',
                                value: notification.category || 'N/A',
                                inline: true
                            },
                            {
                                name: '⚡ Prioridad',
                                value: notification.priority || 'medium',
                                inline: true
                            },
                            {
                                name: '🔗 Canal',
                                value: notification.channel || 'N/A',
                                inline: false
                            }
                        ],
                        timestamp: new Date().toISOString()
                    };

                    await member.send({ embeds: [embed] }).catch(() => {
                        console.log(`No se pudo enviar DM a ${member.user.tag}`);
                    });
                }
            }
        } catch (error) {
            console.error('Error notificando staff:', error);
        }
    }

    /**
     * Notifica a managers
     * @param {Guild} guild 
     * @param {Object} notification 
     */
    async notifyManagers(guild, notification) {
        try {
            const managerRoleIds = ['ID-ROL-MANAGER']; // Configurar roles de manager
            
            for (const roleId of managerRoleIds) {
                const role = guild.roles.cache.get(roleId);
                if (!role) continue;

                for (const member of role.members.values()) {
                    if (member.user.bot) continue;

                    const embed = {
                        title: notification.title,
                        description: notification.description,
                        color: '#FF0000',
                        fields: [
                            {
                                name: '🎫 Ticket ID',
                                value: notification.ticketData.id,
                                inline: true
                            },
                            {
                                name: '👤 Usuario',
                                value: `<@${notification.ticketData.userId}>`,
                                inline: true
                            },
                            {
                                name: '🔗 Ver Ticket',
                                value: `[Ir al canal](${notification.channelUrl})`,
                                inline: false
                            }
                        ],
                        timestamp: new Date().toISOString()
                    };

                    await member.send({ embeds: [embed] }).catch(() => {
                        console.log(`No se pudo enviar DM a manager ${member.user.tag}`);
                    });
                }
            }
        } catch (error) {
            console.error('Error notificando managers:', error);
        }
    }

    /**
     * Envía notificación a webhooks externos
     * @param {string} type 
     * @param {Object} data 
     */
    async sendWebhookNotification(type, data) {
        try {
            const payload = {
                type,
                timestamp: new Date().toISOString(),
                data
            };

            // Enviar a Slack si está configurado
            if (this.config.webhookUrls.slack) {
                await this.sendSlackNotification(payload);
            }

            // Enviar a Teams si está configurado
            if (this.config.webhookUrls.teams) {
                await this.sendTeamsNotification(payload);
            }

            // Enviar a webhook de Discord personalizado
            if (this.config.webhookUrls.discord) {
                await this.sendDiscordWebhook(payload);
            }

        } catch (error) {
            console.error('Error enviando notificación a webhook:', error);
        }
    }

    /**
     * Envía encuesta de satisfacción
     * @param {User} user 
     * @param {Object} ticketData 
     */
    async sendSatisfactionSurvey(user, ticketData) {
        try {
            const embed = {
                title: '⭐ Encuesta de Satisfacción',
                description: `¿Cómo calificarías la resolución de tu ticket **${ticketData.id}**?`,
                color: '#FFD700',
                fields: [
                    {
                        name: '📊 Tu opinión es importante',
                        value: 'Reacciona con ⭐ para calificar del 1 al 5',
                        inline: false
                    }
                ],
                footer: {
                    text: 'Gracias por ayudarnos a mejorar nuestro servicio'
                }
            };

            const message = await user.send({ embeds: [embed] }).catch(() => null);
            
            if (message) {
                // Añadir reacciones para calificación
                await message.react('1️⃣');
                await message.react('2️⃣');
                await message.react('3️⃣');
                await message.react('4️⃣');
                await message.react('5️⃣');
            }

        } catch (error) {
            console.error('Error enviando encuesta de satisfacción:', error);
        }
    }

    /**
     * Obtiene color basado en prioridad
     * @param {string} priority 
     * @returns {string}
     */
    getPriorityColor(priority) {
        const colors = {
            critical: '#FF0000',
            high: '#FF8C00',
            medium: '#FFD700',
            low: '#00FF00'
        };
        return colors[priority] || colors.medium;
    }

    /**
     * Formatea duración
     * @param {number} ms 
     * @returns {string}
     */
    formatDuration(ms) {
        const minutes = Math.floor(ms / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m`;
    }

    /**
     * Programa recordatorio para usuarios inactivos
     * @param {string} ticketId 
     * @param {Object} ticketData 
     * @param {Guild} guild 
     */
    scheduleUserReminder(ticketId, ticketData, guild) {
        const reminderTime = this.config.customerReminderHours * 60 * 60 * 1000; // 24 horas

        const timer = setTimeout(async () => {
            try {
                const user = await guild.client.users.fetch(ticketData.userId).catch(() => null);
                if (user) {
                    const embed = {
                        title: '🔔 Recordatorio de Ticket',
                        description: `Tu ticket **${ticketData.id}** está esperando tu respuesta.`,
                        color: '#FFD700',
                        fields: [
                            {
                                name: '🔗 Ver Ticket',
                                value: `Ve a Discord para continuar la conversación`,
                                inline: false
                            }
                        ]
                    };

                    await user.send({ embeds: [embed] }).catch(console.error);
                }
            } catch (error) {
                console.error('Error enviando recordatorio:', error);
            }
        }, reminderTime);

        this.reminderTimers.set(ticketId, timer);
    }
}

module.exports = new NotificationManager();