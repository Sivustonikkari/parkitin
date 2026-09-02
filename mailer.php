<?php
// UTF-8 email sending for login links and mock invoices.

require_once __DIR__ . '/vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;

function send_login_link_email(string $email, string $link): void
{
    $mail = new PHPMailer(true);
    $mail->isMail();
    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->Encoding = PHPMailer::ENCODING_QUOTED_PRINTABLE;
    $mail->setFrom('no-reply@testinikkari.fi', 'Parkitin');
    $mail->addAddress($email);
    $mail->Subject = 'Your Parkitin login link';
    $mail->Body = "Click the link below to log in to Parkitin:\n\n$link\n\nThis link expires in 15 minutes.";
    $mail->send();
}

