const oneMinute = 60 * 1000 //ms
const oneHour = 60 * oneMinute
const oneDay = 24 * oneHour

export const db_limit_config = {
    "database_limit_dynamic_monitoring":6 * oneHour,
    "database_limit_dynamic_monitoring_summary":30 * oneDay,
    "database_limit_task": oneDay
}