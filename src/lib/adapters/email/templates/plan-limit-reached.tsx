import type { ReactElement } from "react";

import { Locale, getTranslator } from "@/lib/i18n";
import { Layout } from "./layout";

import type { EmailTranslator } from "./layout";

export function PlanLimitReached({
  orgName,
  limitKey,
  limitLabel,
  usage,
  limit,
  upgradeUrl,
}: {
  orgName: string;
  limitKey: string;
  limitLabel: string;
  usage: number;
  limit: number;
  upgradeUrl: string;
}) {
  return (
    <Layout>
      <p>Szanowny Administrator,</p>
      <p>
        Akademia <strong>{orgName}</strong> osiągnęła limit planu: <strong>{limitLabel}</strong>.
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
        </tbody>
      </table>
      <p style="color: #dc2626; font-weight: bold;">
        Limit został osiągnięty (100%). Nowe operacje tworzących ten zasób zostały ZABLOKOWANE.
      </p>
      <p>Gdy limit nie zostanie podniesiony, nie będzie można dodawać nowych zasobów tego typu.</p>
      <p style="margin: 24px 0;">
        <a href={upgradeUrl} style="background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Podnieś limit w panelu płatności
        </a>
      </p>
      <p style="font-size: 12px; color: #6b7280;">
        To jest wiadomość automatyczna — proszę nie odpowiadać na ten e-mail.
      </p>
    </Layout>
  );
}

export function planLimitReachedSubject(
  props: { limitLabel: string },
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  return `🚫 Limit planu osiągnięty: ${props.limitLabel} — operacje zablokowane`;
}