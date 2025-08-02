/*
 * StatsManager - Sistema avanzado de estadísticas y métricas
 * Genera reportes completos y métricas de rendimiento
 */

const fs = require('fs').promises;
const path = require('path');

class StatsManager {
    constructor() {
        this.statsPath = path.join(__dirname, '../data/stats.json');
        this.reportPath = path.join(__dirname, '../data/reports');
        this.stats = {
            tickets: {
                total: 0,
                byStatus: { open: 0, closed: 0 },
                byCategory: {},
                byPriority: { critical: 0, high: 0, medium: 0, low: 0 },
                byMonth: {},
                byDay: {}
            },
            staff: {
                performance: {},
                responseTime: {},
                ticketsHandled: {},
                satisfaction: {}
            },
            metrics: {
                avgResponseTime: 0,
                avgResolutionTime: 0,
                firstResponseTime: 0,
                slaCompliance: 0,
                customerSatisfaction: 0,
                escalationRate: 0
            },
            trends: {
                daily: {},
                weekly: {},
                monthly: {}
            }
        };
        
        this.init();
    }

    async init() {
        try {
            await fs.access(this.reportPath);
        } catch {
            await fs.mkdir(this.reportPath, { recursive: true });
        }
        
        await this.loadStats();
    }

    /**
     * Carga estadísticas desde archivo
     */
    async loadStats() {
        try {
            const data = await fs.readFile(this.statsPath, 'utf-8');
            this.stats = { ...this.stats, ...JSON.parse(data) };
        } catch (error) {
            // Si no existe el archivo, usar estadísticas por defecto
            console.log('📊 Inicializando nuevas estadísticas');
        }
    }

    /**
     * Guarda estadísticas en archivo
     */
    async saveStats() {
        try {
            await fs.writeFile(this.statsPath, JSON.stringify(this.stats, null, 2));
        } catch (error) {
            console.error('Error guardando estadísticas:', error);
        }
    }

    /**
     * Registra un nuevo ticket
     * @param {Object} ticketData 
     */
    async recordTicketCreated(ticketData) {
        this.stats.tickets.total++;
        this.stats.tickets.byStatus.open++;
        
        // Por categoría
        const category = ticketData.category || 'other';
        this.stats.tickets.byCategory[category] = (this.stats.tickets.byCategory[category] || 0) + 1;
        
        // Por prioridad
        const priority = ticketData.priority || 'medium';
        this.stats.tickets.byPriority[priority]++;
        
        // Por fecha
        const date = new Date(ticketData.createdAt);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const dayKey = date.toISOString().split('T')[0];
        
        this.stats.tickets.byMonth[monthKey] = (this.stats.tickets.byMonth[monthKey] || 0) + 1;
        this.stats.tickets.byDay[dayKey] = (this.stats.tickets.byDay[dayKey] || 0) + 1;
        
        await this.saveStats();
    }

    /**
     * Registra cuando un ticket es cerrado
     * @param {Object} ticketData 
     */
    async recordTicketClosed(ticketData) {
        this.stats.tickets.byStatus.open--;
        this.stats.tickets.byStatus.closed++;
        
        // Calcular tiempo de resolución
        const resolutionTime = ticketData.closedAt - ticketData.createdAt;
        
        // Actualizar métricas de staff
        if (ticketData.claimedBy) {
            const staffId = ticketData.claimedBy;
            if (!this.stats.staff.ticketsHandled[staffId]) {
                this.stats.staff.ticketsHandled[staffId] = 0;
            }
            this.stats.staff.ticketsHandled[staffId]++;
            
            // Tiempo de resolución por staff
            if (!this.stats.staff.responseTime[staffId]) {
                this.stats.staff.responseTime[staffId] = [];
            }
            this.stats.staff.responseTime[staffId].push(resolutionTime);
        }
        
        await this.updateMetrics();
        await this.saveStats();
    }

    /**
     * Registra cuando un staff reclama un ticket
     * @param {Object} ticketData 
     * @param {string} staffId 
     */
    async recordTicketClaimed(ticketData, staffId) {
        const responseTime = Date.now() - ticketData.createdAt;
        
        if (!this.stats.staff.responseTime[staffId]) {
            this.stats.staff.responseTime[staffId] = [];
        }
        this.stats.staff.responseTime[staffId].push(responseTime);
        
        await this.updateMetrics();
        await this.saveStats();
    }

    /**
     * Registra calificación de satisfacción
     * @param {string} ticketId 
     * @param {number} rating 
     * @param {string} staffId 
     */
    async recordSatisfactionRating(ticketId, rating, staffId) {
        if (!this.stats.staff.satisfaction[staffId]) {
            this.stats.staff.satisfaction[staffId] = [];
        }
        this.stats.staff.satisfaction[staffId].push(rating);
        
        await this.updateMetrics();
        await this.saveStats();
    }

    /**
     * Actualiza métricas calculadas
     */
    async updateMetrics() {
        // Tiempo promedio de respuesta
        const allResponseTimes = Object.values(this.stats.staff.responseTime).flat();
        if (allResponseTimes.length > 0) {
            this.stats.metrics.avgResponseTime = allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length;
        }

        // Satisfacción del cliente
        const allSatisfactionRatings = Object.values(this.stats.staff.satisfaction).flat();
        if (allSatisfactionRatings.length > 0) {
            this.stats.metrics.customerSatisfaction = allSatisfactionRatings.reduce((a, b) => a + b, 0) / allSatisfactionRatings.length;
        }

        // Tasa de escalación (ejemplo: tickets que toman más de 4 horas)
        const escalatedTickets = allResponseTimes.filter(time => time > 4 * 60 * 60 * 1000).length;
        this.stats.metrics.escalationRate = allResponseTimes.length > 0 ? 
            (escalatedTickets / allResponseTimes.length) * 100 : 0;
    }

    /**
     * Obtiene estadísticas completas
     * @returns {Object}
     */
    async getCompleteStats() {
        await this.updateMetrics();
        return this.stats;
    }

    /**
     * Obtiene estadísticas resumidas
     * @returns {Object}
     */
    async getSummaryStats() {
        await this.updateMetrics();
        
        return {
            totalTickets: this.stats.tickets.total,
            openTickets: this.stats.tickets.byStatus.open,
            closedTickets: this.stats.tickets.byStatus.closed,
            avgResponseTime: this.formatDuration(this.stats.metrics.avgResponseTime),
            customerSatisfaction: Math.round(this.stats.metrics.customerSatisfaction * 10) / 10,
            topCategory: this.getTopCategory(),
            topStaff: this.getTopStaff(),
            escalationRate: Math.round(this.stats.metrics.escalationRate * 10) / 10
        };
    }

    /**
     * Obtiene la categoría más común
     * @returns {string}
     */
    getTopCategory() {
        const categories = this.stats.tickets.byCategory;
        return Object.keys(categories).reduce((a, b) => 
            categories[a] > categories[b] ? a : b, 'N/A'
        );
    }

    /**
     * Obtiene el staff más activo
     * @returns {string}
     */
    getTopStaff() {
        const staffTickets = this.stats.staff.ticketsHandled;
        const topStaffId = Object.keys(staffTickets).reduce((a, b) => 
            staffTickets[a] > staffTickets[b] ? a : b, null
        );
        return topStaffId ? `<@${topStaffId}>` : 'N/A';
    }

    /**
     * Genera estadísticas por período
     * @param {string} period - 'day', 'week', 'month'
     * @param {number} days - Número de días hacia atrás
     * @returns {Object}
     */
    async getStatsByPeriod(period = 'day', days = 30) {
        const now = new Date();
        const stats = {};

        for (let i = 0; i < days; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            
            let key;
            switch (period) {
                case 'day':
                    key = date.toISOString().split('T')[0];
                    break;
                case 'week':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = weekStart.toISOString().split('T')[0];
                    break;
                case 'month':
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    break;
            }
            
            stats[key] = this.stats.tickets.byDay[key] || 0;
        }

        return stats;
    }

    /**
     * Genera reporte de rendimiento del staff
     * @returns {Array}
     */
    async getStaffPerformanceReport() {
        const staffReport = [];
        
        for (const [staffId, ticketCount] of Object.entries(this.stats.staff.ticketsHandled)) {
            const responseTimes = this.stats.staff.responseTime[staffId] || [];
            const satisfactionRatings = this.stats.staff.satisfaction[staffId] || [];
            
            const avgResponseTime = responseTimes.length > 0 ? 
                responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
            
            const avgSatisfaction = satisfactionRatings.length > 0 ?
                satisfactionRatings.reduce((a, b) => a + b, 0) / satisfactionRatings.length : 0;

            staffReport.push({
                staffId,
                ticketsHandled: ticketCount,
                avgResponseTime: this.formatDuration(avgResponseTime),
                avgSatisfaction: Math.round(avgSatisfaction * 10) / 10,
                totalResponses: responseTimes.length,
                totalRatings: satisfactionRatings.length
            });
        }

        return staffReport.sort((a, b) => b.ticketsHandled - a.ticketsHandled);
    }

    /**
     * Genera reporte mensual
     * @param {number} year 
     * @param {number} month 
     * @returns {Object}
     */
    async generateMonthlyReport(year, month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const monthlyTickets = this.stats.tickets.byMonth[monthKey] || 0;
        
        // Obtener datos diarios del mes
        const daysInMonth = new Date(year, month, 0).getDate();
        const dailyStats = {};
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dayKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            dailyStats[day] = this.stats.tickets.byDay[dayKey] || 0;
        }

        const report = {
            period: `${year}-${month}`,
            totalTickets: monthlyTickets,
            dailyBreakdown: dailyStats,
            avgTicketsPerDay: Math.round(monthlyTickets / daysInMonth * 10) / 10,
            peakDay: Object.keys(dailyStats).reduce((a, b) => 
                dailyStats[a] > dailyStats[b] ? a : b
            ),
            trends: this.calculateTrends(dailyStats),
            generatedAt: new Date().toISOString()
        };

        // Guardar reporte
        const reportPath = path.join(this.reportPath, `monthly-${monthKey}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        return report;
    }

    /**
     * Calcula tendencias en los datos
     * @param {Object} data 
     * @returns {Object}
     */
    calculateTrends(data) {
        const values = Object.values(data);
        if (values.length < 2) return { trend: 'insufficient_data' };

        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;

        return {
            trend: percentChange > 5 ? 'increasing' : percentChange < -5 ? 'decreasing' : 'stable',
            percentChange: Math.round(percentChange * 10) / 10,
            firstHalfAvg: Math.round(firstAvg * 10) / 10,
            secondHalfAvg: Math.round(secondAvg * 10) / 10
        };
    }

    /**
     * Exporta estadísticas a CSV
     * @param {string} type - 'tickets', 'staff', 'daily'
     * @returns {string}
     */
    async exportToCSV(type) {
        let csv = '';
        
        switch (type) {
            case 'tickets':
                csv = 'Fecha,Total,Abiertos,Cerrados,Categoría Principal\n';
                for (const [date, count] of Object.entries(this.stats.tickets.byDay)) {
                    csv += `${date},${count},${this.stats.tickets.byStatus.open},${this.stats.tickets.byStatus.closed},${this.getTopCategory()}\n`;
                }
                break;
                
            case 'staff':
                csv = 'Staff ID,Tickets Manejados,Tiempo Promedio Respuesta,Satisfacción Promedio\n';
                const staffReport = await this.getStaffPerformanceReport();
                for (const staff of staffReport) {
                    csv += `${staff.staffId},${staff.ticketsHandled},${staff.avgResponseTime},${staff.avgSatisfaction}\n`;
                }
                break;
                
            case 'daily':
                csv = 'Fecha,Tickets Creados\n';
                for (const [date, count] of Object.entries(this.stats.tickets.byDay)) {
                    csv += `${date},${count}\n`;
                }
                break;
        }
        
        return csv;
    }

    /**
     * Formatea duración en milisegundos
     * @param {number} ms 
     * @returns {string}
     */
    formatDuration(ms) {
        if (!ms || ms === 0) return '0m';
        
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    /**
     * Obtiene métricas en tiempo real
     * @returns {Object}
     */
    async getRealTimeMetrics() {
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
        
        return {
            current: {
                openTickets: this.stats.tickets.byStatus.open,
                totalTickets: this.stats.tickets.total,
                avgResponseTime: this.formatDuration(this.stats.metrics.avgResponseTime),
                satisfaction: this.stats.metrics.customerSatisfaction
            },
            trends: {
                last24h: await this.getStatsByPeriod('day', 1),
                last7days: await this.getStatsByPeriod('day', 7),
                thisMonth: await this.getStatsByPeriod('month', 1)
            },
            alerts: this.generateAlerts()
        };
    }

    /**
     * Genera alertas basadas en métricas
     * @returns {Array}
     */
    generateAlerts() {
        const alerts = [];
        
        // Alerta por tiempo de respuesta alto
        if (this.stats.metrics.avgResponseTime > 4 * 60 * 60 * 1000) { // > 4 horas
            alerts.push({
                type: 'warning',
                message: 'Tiempo de respuesta promedio superior a 4 horas',
                metric: 'response_time',
                value: this.formatDuration(this.stats.metrics.avgResponseTime)
            });
        }
        
        // Alerta por satisfacción baja
        if (this.stats.metrics.customerSatisfaction < 3.5) {
            alerts.push({
                type: 'error',
                message: 'Satisfacción del cliente por debajo del umbral',
                metric: 'satisfaction',
                value: this.stats.metrics.customerSatisfaction
            });
        }
        
        // Alerta por alta tasa de escalación
        if (this.stats.metrics.escalationRate > 20) {
            alerts.push({
                type: 'warning',
                message: 'Tasa de escalación superior al 20%',
                metric: 'escalation_rate',
                value: `${this.stats.metrics.escalationRate}%`
            });
        }
        
        return alerts;
    }
}

module.exports = new StatsManager();