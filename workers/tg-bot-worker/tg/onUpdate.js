import { onMessage } from './onMessage'

/**
 * Handle incoming Update
 * https://core.telegram.org/bots/api#update
 */
export async function onUpdate(bot, update) {
    if ('message' in update) {
        await onMessage(bot, update.message)
    }
}