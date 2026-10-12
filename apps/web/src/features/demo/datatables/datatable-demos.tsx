"use client";

import { useTranslations } from "next-intl";

import DataTableBasic from "./basic";
import DataTableWithFilters from "./filters";
import DataTablePinnableColumn from "./pinnable";

export function DatatableDemos() {
  const t = useTranslations("demo");

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t("datatable.basicTitle")}</h2>
        <DataTableBasic />
      </div>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t("datatable.pinnableTitle")}</h2>
        <DataTablePinnableColumn />
      </div>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t("datatable.filtersTitle")}</h2>
        <DataTableWithFilters />
      </div>
    </div>
  );
}
