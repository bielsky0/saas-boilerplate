import type { ReactElement } from "react";

import { Locale, getTranslator } from "@/lib/i18n";
import { Layout } from "./layout";

import type { EmailTranslator } from "./layout";

export function PlanLimitApproaching({
  orgName,
  limitKey,
  limitLabel,
  usage,
  limit,
  percentage,
  upgradeUrl,
}: {
  orgName: string;
  limitKey: string;
  limitLabel: string;
  usage: number;
  limit: number;
  percentage: number;
  upgradeUrl: string;
}) {
  return (
    <Layout>
      <p>Szanowny Administrator,</p>
      <p>
        Akademia <strong>{orgName}</strong> zbliża się do limitu planu: <strong>{limitLabel}</strong>.
      </p>
      <table cellPadding="0" cellSpacing="0" style={{ width: "100%", margin: "16px 0" }}>
        <tbody>
          <tr>
            <td style="padding: 8px 0;">Limit:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">{limit}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">Zużycie:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">{usage}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">Procentowe zużycie:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #f59e0b;">{percentage}%</td>
          </tr>
        </tbody>
      </table>
      <p>Próg 80% został przekroczony. Gdy limit zostanie osiągnięty, nowe operacje zostaną zablokowane.</p>
      <p style="margin: 24px 0;">
        <a href={upgradeUrl} style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Przejdź do płatności i podnieś limit
        </a>
      </p>
      <p style="font-size: 12px; color: #6b7280;">
        To jest wiadomość automatyczna — proszę nie odpowiadać na ten e-mail.
      </p>
    </Layout>
  );
}

export function planLimitApproachingSubject(
  props: { limitLabel: string; percentage: number },
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  return `⚠️ Limit planu: ${props.limitLabel} osiągnął ${props.percentage}%`;
}