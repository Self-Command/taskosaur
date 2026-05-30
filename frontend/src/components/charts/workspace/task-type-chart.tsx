// components/charts/workspace/task-type-chart.tsx
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ChartWrapper } from "../chart-wrapper";
import { useRouter } from "next/router";

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
  SUBTASK: { label: "Subtask", color: "#F97316" },
};

interface TaskTypeChartProps {
  data: Array<{ type: string; _count: { type: number } }>;
  workspaceId?: string;
}

export function TaskTypeChart({ data, workspaceId }: TaskTypeChartProps) {
  const router = useRouter();
  const { workspaceSlug } = router.query;

  const chartData = data?.map((item) => ({
    name: chartConfig[item.type as keyof typeof chartConfig]?.label || item.type,
    value: item._count.type,
    color: chartConfig[item.type as keyof typeof chartConfig]?.color || "#8B5CF6",
    id: item.type,
  }));

  const handleClick = (entry: any) => {
    const slug = workspaceSlug || workspaceId;
    if (
      slug &&
      typeof slug === "string" &&
      /^[a-zA-Z0-9-]+$/.test(slug) &&
      entry?.id
    ) {
      router.push({
        pathname: "/[workspaceSlug]/tasks",
        query: { workspaceSlug: slug, types: entry.id },
      });
    }
  };

  // Custom label renderer
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <ChartWrapper
      title="Task Type Distribution"
      description="Types of tasks across workspace"
      config={chartConfig}
      className="border-[var(--border)]"
    >
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomizedLabel}
            outerRadius={100}
            innerRadius={60}
            paddingAngle={2}
            dataKey="value"
            className="outline-none"
          >
            {chartData?.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color} 
                onClick={() => handleClick(entry)}
                className="cursor-pointer"
              />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent className="bg-[var(--accent)] border-0" />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            iconSize={10}
            formatter={(value, entry: any) => (
              <span key={entry} className="text-muted-foreground text-xs">
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
