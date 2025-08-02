/*
 * TranscriptManager - Sistema avanzado de transcripciones
 * Genera transcripciones mejoradas con metadata y múltiples formatos
 */

const fs = require('fs').promises;
const path = require('path');
const { createTranscript } = require('discord-html-transcripts');

class TranscriptManager {
    constructor() {
        this.transcriptsDir = path.join(__dirname, '../data/transcripts');
        this.summariesDir = path.join(__dirname, '../data/summaries');
        this.init();
    }

    async init() {
        try {
            await fs.access(this.transcriptsDir);
        } catch {
            await fs.mkdir(this.transcriptsDir, { recursive: true });
        }

        try {
            await fs.access(this.summariesDir);
        } catch {
            await fs.mkdir(this.summariesDir, { recursive: true });
        }
    }

    /**
     * Genera una transcripción avanzada con metadata
     * @param {TextChannel} channel 
     * @param {Object} ticketData 
     * @returns {Promise<Object>}
     */
    async generateAdvancedTranscript(channel, ticketData) {
        try {
            const messages = await this.fetchAllMessages(channel);
            const metadata = await this.generateMetadata(channel, ticketData, messages);
            
            // Generar transcripción HTML
            const htmlTranscript = await createTranscript(channel, {
                fileName: `${channel.name}.html`,
                saveImages: true,
                poweredBy: false,
                footerText: `Generado por Sistema Avanzado de Tickets | ${new Date().toLocaleString()}`,
                hydrate: true
            });

            // Generar transcripción en texto plano
            const textTranscript = await this.generateTextTranscript(messages, metadata);
            
            // Generar resumen automático
            const summary = await this.generateSummary(messages, metadata);

            const transcriptData = {
                ticketId: ticketData.id,
                channelId: channel.id,
                channelName: channel.name,
                metadata,
                summary,
                formats: {
                    html: htmlTranscript,
                    text: textTranscript,
                    json: JSON.stringify({
                        metadata,
                        messages: messages.map(msg => ({
                            id: msg.id,
                            author: {
                                id: msg.author.id,
                                username: msg.author.username,
                                displayName: msg.author.displayName
                            },
                            content: msg.content,
                            timestamp: msg.createdTimestamp,
                            attachments: msg.attachments.map(att => ({
                                name: att.name,
                                url: att.url,
                                size: att.size
                            })),
                            embeds: msg.embeds.length,
                            reactions: msg.reactions.cache.size
                        }))
                    }, null, 2)
                },
                generatedAt: Date.now()
            };

            // Guardar archivos
            await this.saveTranscriptFiles(channel.id, transcriptData);

            return transcriptData;

        } catch (error) {
            console.error('Error generando transcripción avanzada:', error);
            throw error;
        }
    }

    /**
     * Obtiene todos los mensajes del canal
     * @param {TextChannel} channel 
     * @returns {Promise<Array>}
     */
    async fetchAllMessages(channel) {
        const messages = [];
        let lastMessageId = null;

        while (true) {
            const options = { limit: 100 };
            if (lastMessageId) {
                options.before = lastMessageId;
            }

            const batch = await channel.messages.fetch(options);
            if (batch.size === 0) break;

            messages.push(...batch.values());
            lastMessageId = batch.last().id;
        }

        return messages.reverse(); // Orden cronológico
    }

    /**
     * Genera metadata detallada del ticket
     * @param {TextChannel} channel 
     * @param {Object} ticketData 
     * @param {Array} messages 
     * @returns {Promise<Object>}
     */
    async generateMetadata(channel, ticketData, messages) {
        const participants = new Set();
        const attachments = [];
        const reactions = new Map();
        let firstStaffResponse = null;

        for (const message of messages) {
            participants.add(message.author.id);
            
            // Registrar archivos adjuntos
            if (message.attachments.size > 0) {
                message.attachments.forEach(att => {
                    attachments.push({
                        name: att.name,
                        url: att.url,
                        size: att.size,
                        uploadedBy: message.author.id,
                        uploadedAt: message.createdTimestamp
                    });
                });
            }

            // Registrar reacciones
            message.reactions.cache.forEach((reaction, emoji) => {
                if (!reactions.has(emoji)) {
                    reactions.set(emoji, 0);
                }
                reactions.set(emoji, reactions.get(emoji) + reaction.count);
            });

            // Encontrar primera respuesta del staff
            if (!firstStaffResponse && message.author.id !== ticketData.userId) {
                const member = channel.guild.members.cache.get(message.author.id);
                if (member && this.isStaff(member)) {
                    firstStaffResponse = message.createdTimestamp;
                }
            }
        }

        const duration = (ticketData.closedAt || Date.now()) - ticketData.createdAt;
        const responseTime = firstStaffResponse ? firstStaffResponse - ticketData.createdAt : null;

        return {
            ticketId: ticketData.id,
            category: ticketData.category,
            priority: ticketData.priority || 'medium',
            creator: ticketData.userId,
            claimedBy: ticketData.claimedBy,
            closedBy: ticketData.closedBy,
            createdAt: ticketData.createdAt,
            claimedAt: ticketData.claimedAt,
            closedAt: ticketData.closedAt,
            duration: {
                ms: duration,
                formatted: this.formatDuration(duration)
            },
            responseTime: responseTime ? {
                ms: responseTime,
                formatted: this.formatDuration(responseTime)
            } : null,
            participants: Array.from(participants),
            statistics: {
                totalMessages: messages.length,
                totalAttachments: attachments.length,
                totalReactions: Array.from(reactions.values()).reduce((a, b) => a + b, 0),
                uniqueParticipants: participants.size
            },
            attachments,
            reactions: Object.fromEntries(reactions),
            resolution: ticketData.reason || 'No especificada'
        };
    }

    /**
     * Genera transcripción en texto plano
     * @param {Array} messages 
     * @param {Object} metadata 
     * @returns {string}
     */
    async generateTextTranscript(messages, metadata) {
        let transcript = `=== TRANSCRIPCIÓN DEL TICKET ${metadata.ticketId} ===\n\n`;
        
        transcript += `📋 INFORMACIÓN GENERAL:\n`;
        transcript += `- ID del Ticket: ${metadata.ticketId}\n`;
        transcript += `- Categoría: ${metadata.category}\n`;
        transcript += `- Prioridad: ${metadata.priority}\n`;
        transcript += `- Creado: ${new Date(metadata.createdAt).toLocaleString()}\n`;
        transcript += `- Cerrado: ${metadata.closedAt ? new Date(metadata.closedAt).toLocaleString() : 'Aún abierto'}\n`;
        transcript += `- Duración: ${metadata.duration.formatted}\n`;
        transcript += `- Tiempo de respuesta: ${metadata.responseTime ? metadata.responseTime.formatted : 'N/A'}\n`;
        transcript += `- Total de mensajes: ${metadata.statistics.totalMessages}\n`;
        transcript += `- Participantes: ${metadata.statistics.uniqueParticipants}\n\n`;

        transcript += `💬 CONVERSACIÓN:\n`;
        transcript += `${'='.repeat(50)}\n\n`;

        for (const message of messages) {
            const timestamp = new Date(message.createdTimestamp).toLocaleString();
            const author = message.author.displayName || message.author.username;
            
            transcript += `[${timestamp}] ${author}:\n`;
            
            if (message.content) {
                transcript += `${message.content}\n`;
            }
            
            if (message.attachments.size > 0) {
                transcript += `📎 Archivos adjuntos: ${message.attachments.map(att => att.name).join(', ')}\n`;
            }
            
            if (message.embeds.length > 0) {
                transcript += `📋 Embeds: ${message.embeds.length}\n`;
            }
            
            transcript += `\n`;
        }

        if (metadata.attachments.length > 0) {
            transcript += `\n📁 ARCHIVOS ADJUNTOS:\n`;
            transcript += `${'='.repeat(30)}\n`;
            metadata.attachments.forEach((att, index) => {
                transcript += `${index + 1}. ${att.name} (${this.formatFileSize(att.size)})\n`;
                transcript += `   URL: ${att.url}\n`;
                transcript += `   Subido por: ${att.uploadedBy} el ${new Date(att.uploadedAt).toLocaleString()}\n\n`;
            });
        }

        transcript += `\n✅ RESOLUCIÓN: ${metadata.resolution}\n`;
        transcript += `\n--- Fin de la transcripción ---\n`;
        transcript += `Generado el ${new Date().toLocaleString()} por Sistema Avanzado de Tickets`;

        return transcript;
    }

    /**
     * Genera un resumen automático del ticket
     * @param {Array} messages 
     * @param {Object} metadata 
     * @returns {Object}
     */
    async generateSummary(messages, metadata) {
        const keywordAnalysis = this.analyzeKeywords(messages);
        const sentimentAnalysis = this.analyzeSentiment(messages);
        const issueClassification = this.classifyIssue(messages);

        return {
            issueType: issueClassification.type,
            confidence: issueClassification.confidence,
            mainKeywords: keywordAnalysis.slice(0, 10),
            sentiment: sentimentAnalysis,
            quickSummary: this.generateQuickSummary(messages, metadata),
            recommendedActions: this.generateRecommendations(messages, metadata),
            satisfactionScore: this.calculateSatisfactionScore(messages),
            resolutionTime: metadata.responseTime ? 'Rápida' : 'Lenta',
            complexity: this.assessComplexity(messages, metadata)
        };
    }

    /**
     * Analiza palabras clave en los mensajes
     * @param {Array} messages 
     * @returns {Array}
     */
    analyzeKeywords(messages) {
        const wordCount = new Map();
        const commonWords = new Set(['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'al', 'del', 'me', 'mi', 'si', 'ya', 'pero', 'más', 'muy', 'yo', 'tu', 'he', 'ha', 'has', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must']);

        messages.forEach(message => {
            if (message.content) {
                const words = message.content.toLowerCase()
                    .replace(/[^\w\s]/g, ' ')
                    .split(/\s+/)
                    .filter(word => word.length > 3 && !commonWords.has(word))
                    .filter(word => !/^\d+$/.test(word));

                words.forEach(word => {
                    wordCount.set(word, (wordCount.get(word) || 0) + 1);
                });
            }
        });

        return Array.from(wordCount.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([word, count]) => ({ word, count }));
    }

    /**
     * Analiza el sentimiento general de la conversación
     * @param {Array} messages 
     * @returns {Object}
     */
    analyzeSentiment(messages) {
        const positiveWords = ['gracias', 'perfecto', 'excelente', 'genial', 'bien', 'bueno', 'solved', 'fixed', 'working', 'thanks', 'perfect', 'great', 'good', 'excellent'];
        const negativeWords = ['problema', 'error', 'mal', 'falla', 'bug', 'issue', 'broken', 'wrong', 'bad', 'terrible', 'awful', 'hate'];

        let positiveCount = 0;
        let negativeCount = 0;
        let totalWords = 0;

        messages.forEach(message => {
            if (message.content) {
                const words = message.content.toLowerCase().split(/\s+/);
                totalWords += words.length;

                words.forEach(word => {
                    if (positiveWords.includes(word)) positiveCount++;
                    if (negativeWords.includes(word)) negativeCount++;
                });
            }
        });

        const sentiment = positiveCount > negativeCount ? 'positive' : 
                         negativeCount > positiveCount ? 'negative' : 'neutral';

        return {
            sentiment,
            positiveCount,
            negativeCount,
            score: (positiveCount - negativeCount) / Math.max(1, totalWords / 10)
        };
    }

    /**
     * Clasifica el tipo de problema
     * @param {Array} messages 
     * @returns {Object}
     */
    classifyIssue(messages) {
        const classifications = {
            technical: ['error', 'bug', 'problema', 'falla', 'no funciona', 'broken', 'issue', 'crash'],
            billing: ['pago', 'factura', 'cobro', 'subscription', 'payment', 'billing', 'invoice'],
            account: ['cuenta', 'password', 'login', 'access', 'account', 'registro', 'sign up'],
            feature: ['sugerencia', 'feature', 'improvement', 'suggestion', 'new', 'add'],
            general: ['pregunta', 'question', 'help', 'ayuda', 'como', 'how', 'what', 'que']
        };

        const scores = {};
        Object.keys(classifications).forEach(type => {
            scores[type] = 0;
        });

        messages.forEach(message => {
            if (message.content) {
                const content = message.content.toLowerCase();
                
                Object.entries(classifications).forEach(([type, keywords]) => {
                    keywords.forEach(keyword => {
                        if (content.includes(keyword)) {
                            scores[type]++;
                        }
                    });
                });
            }
        });

        const topType = Object.entries(scores)
            .sort((a, b) => b[1] - a[1])[0];

        return {
            type: topType[0],
            confidence: topType[1] > 0 ? Math.min(1, topType[1] / 5) : 0.5
        };
    }

    /**
     * Genera un resumen rápido del ticket
     * @param {Array} messages 
     * @param {Object} metadata 
     * @returns {string}
     */
    generateQuickSummary(messages, metadata) {
        const firstMessage = messages.find(msg => msg.author.id === metadata.creator);
        const lastMessage = messages[messages.length - 1];
        
        let summary = `Ticket de ${metadata.category} creado por el usuario ${metadata.creator}. `;
        
        if (firstMessage && firstMessage.content) {
            const excerpt = firstMessage.content.substring(0, 100);
            summary += `Problema inicial: "${excerpt}${firstMessage.content.length > 100 ? '...' : ''}". `;
        }
        
        summary += `La conversación duró ${metadata.duration.formatted} con ${metadata.statistics.totalMessages} mensajes entre ${metadata.statistics.uniqueParticipants} participantes.`;
        
        if (metadata.closedAt) {
            summary += ` El ticket fue resuelto con la siguiente resolución: ${metadata.resolution}`;
        }

        return summary;
    }

    /**
     * Genera recomendaciones basadas en el ticket
     * @param {Array} messages 
     * @param {Object} metadata 
     * @returns {Array}
     */
    generateRecommendations(messages, metadata) {
        const recommendations = [];

        // Basado en tiempo de respuesta
        if (metadata.responseTime && metadata.responseTime.ms > 3600000) { // > 1 hora
            recommendations.push('Mejorar tiempo de respuesta inicial del staff');
        }

        // Basado en duración
        if (metadata.duration.ms > 86400000) { // > 1 día
            recommendations.push('Considerar escalación más rápida para tickets complejos');
        }

        // Basado en número de mensajes
        if (metadata.statistics.totalMessages > 50) {
            recommendations.push('Implementar templates de respuesta para casos similares');
        }

        // Basado en participantes
        if (metadata.statistics.uniqueParticipants > 5) {
            recommendations.push('Revisar proceso de escalación para evitar confusión');
        }

        if (recommendations.length === 0) {
            recommendations.push('Ticket gestionado de manera eficiente');
        }

        return recommendations;
    }

    /**
     * Calcula un score de satisfacción aproximado
     * @param {Array} messages 
     * @returns {number}
     */
    calculateSatisfactionScore(messages) {
        const satisfactionWords = {
            5: ['excelente', 'perfecto', 'amazing', 'perfect', 'excellent'],
            4: ['bueno', 'bien', 'good', 'nice', 'helpful'],
            3: ['ok', 'acceptable', 'fine'],
            2: ['malo', 'lento', 'slow', 'bad'],
            1: ['terrible', 'awful', 'horrible', 'worst']
        };

        let totalScore = 0;
        let count = 0;

        messages.forEach(message => {
            if (message.content) {
                const content = message.content.toLowerCase();
                
                Object.entries(satisfactionWords).forEach(([score, words]) => {
                    words.forEach(word => {
                        if (content.includes(word)) {
                            totalScore += parseInt(score);
                            count++;
                        }
                    });
                });
            }
        });

        return count > 0 ? Math.round((totalScore / count) * 10) / 10 : 3.5;
    }

    /**
     * Evalúa la complejidad del ticket
     * @param {Array} messages 
     * @param {Object} metadata 
     * @returns {string}
     */
    assessComplexity(messages, metadata) {
        let complexity = 0;

        // Factores que aumentan complejidad
        if (metadata.duration.ms > 86400000) complexity++; // > 1 día
        if (metadata.statistics.totalMessages > 30) complexity++; // Muchos mensajes
        if (metadata.statistics.uniqueParticipants > 3) complexity++; // Muchos participantes
        if (metadata.statistics.totalAttachments > 5) complexity++; // Muchos archivos
        
        if (complexity >= 3) return 'Alta';
        if (complexity >= 2) return 'Media';
        return 'Baja';
    }

    /**
     * Guarda los archivos de transcripción
     * @param {string} channelId 
     * @param {Object} transcriptData 
     */
    async saveTranscriptFiles(channelId, transcriptData) {
        const basePath = path.join(this.transcriptsDir, channelId);
        
        // Guardar HTML
        await fs.writeFile(`${basePath}.html`, transcriptData.formats.html.attachment);
        
        // Guardar texto
        await fs.writeFile(`${basePath}.txt`, transcriptData.formats.text);
        
        // Guardar JSON
        await fs.writeFile(`${basePath}.json`, transcriptData.formats.json);
        
        // Guardar resumen
        const summaryPath = path.join(this.summariesDir, `${channelId}.json`);
        await fs.writeFile(summaryPath, JSON.stringify({
            metadata: transcriptData.metadata,
            summary: transcriptData.summary,
            generatedAt: transcriptData.generatedAt
        }, null, 2));
    }

    /**
     * Verifica si un miembro es staff
     * @param {GuildMember} member 
     * @returns {boolean}
     */
    isStaff(member) {
        // Esta función debería usar la configuración del sistema
        // Por ahora, asumimos que cualquier usuario con permisos de gestión es staff
        return member.permissions.has('ManageMessages') || 
               member.permissions.has('ManageChannels') ||
               member.permissions.has('Administrator');
    }

    /**
     * Formatea duración en milisegundos a texto legible
     * @param {number} ms 
     * @returns {string}
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    /**
     * Formatea el tamaño del archivo
     * @param {number} bytes 
     * @returns {string}
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = new TranscriptManager();