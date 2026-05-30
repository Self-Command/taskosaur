// components/charts/project/task-type-chart.tsx
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import {
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { ChartWrapper } from "../chart-wrapper";
import { useTranslation } from "react-i18next";

const chartConfig = {
  TASK: { label: "Task", color: "#3B82F6" },
  HABIT: { label: "Habit", color: "#14B8A6" },
  STUDY: { label: "Study", color: "#6366F1" },
  WORK: { label: "Work", color: "#F59E0B" },
  LIFE: { label: "Life", color: "#EC4899" },
  GOAL: { label: "Goal", color: "#8B5CF6" },
  EVENT: { label: "Event", color: "#06B6D4" },
  NOTE: { label: "Note", color: "#64748B" },
  PROJECT: { label: "Project", color: "#8B5CF6" },
};

interface TaskTypeChartProps {
  data: Array<{ type: string; _count: { type: number } }>;
}

export function TaskTypeChart({ data }: TaskTypeChartProps) {
  const { t } = useTranslation(["analytics"]);
  const safeData = Array.isArray(data) ? data : [];
  
  const translatedConfig = {
    TASK: { label: t("charts.task_type_distribution.types.task"), color: chartConfig.TASK.color },
    HABIT: { label: t("charts.task_type_distribution.types.habit"), color: chartConfig.HABIT.color },
    STUDY: { label: t("charts.task_type_distribution.types.study"), color: chartConfig.STUDY.color },
    WORK: { label: t("charts.task_type_distribution.types.work"), color: chartConfig.WORK.color },
    LIFE: { label: t("charts.task_type_distribution.types.life"), color: chartConfig.LIFE.color },
    GOAL: { label: t("charts.task_type_distribution.types.goal"), color: chartConfig.GOAL.color },
    EVENT: { label: t("charts.task_type_distribution.types.event"), color: chartConfig.EVENT.color },
    NOTE: { label: t("charts.task_type_distribution.types.note"), color: chartConfig.NOTE.color },
    PROJECT: { label: t("charts.task_type_distribution.types.project"), color: chartConfig.PROJECT.color },
  };

  const chartData = safeData.map((item) => ({
    name: translatedConfig[item.type as keyof typeof translatedConfig]?.label || item.type,
    value: item._count.type,
    color: translatedConfig[item.type as keyof typeof translatedConfig]?.color || "#8B5CF6",
  }));

  const typeOrder = ["TASK", "HABIT", "STUDY", "WORK", "LIFE", "GOAL", "EVENT", "NOTE", "PROJECT"];
  const sortedChartData =
    chartData &&
    [...chartData].sort((a, b) => {
      return typeOrder.indexOf(a.name.toUpperCase()) - typeOrder.indexOf(b.name.toUpperCase());
    });

  return (
    <ChartWrapper
      title={t("charts.task_type_distribution.title")}
      description={t("charts.task_type_distribution.description")}
      config={translatedConfig}
      className="border-[var(--border)]"
    >
      <ResponsiveContainer width="100%" height={350}>
        <BarChart
          data={sortedChartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          barSize={40}
        >
          <XAxis dataKey="name" tickLine={true} axisLine={true} tick={{ fontSize: 12 }} />
          <YAxis tickLine={true} axisLine={true} tick={{ fontSize: 12 }} allowDecimals={false} />
          <ChartTooltip
            content={
              <ChartTooltipContent hideLabel={true} className="bg-[var(--accent)] border-0" />
            }
            cursor={{ fill: "rgba(0, 0, 0, 0.00)" }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {sortedChartData?.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
          <ChartLegend content={<ChartLegendContent />} />
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
