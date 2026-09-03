import nodemailer from 'nodemailer';
import { ServerConfig } from './config';
import type { LoginLinkSender } from './account';

export function createLoginLinkSender(config: ServerConfig): LoginLinkSender {
    const transport = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: {
            user: config.smtp.user,
            pass: config.smtp.password,
        },
    });

    return async (email, link) => {
        await transport.sendMail({
            from: config.smtp.from,
            to: email,
            subject: 'Parkitin login link',
            text: `Open this link to sign in to Parkitin:\n\n${link}`,
        });
    };
}