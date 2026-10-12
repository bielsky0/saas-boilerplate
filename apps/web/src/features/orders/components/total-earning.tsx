// Third-party Imports
import { ChevronUpIcon, ChevronDownIcon } from "lucide-react";

// Component Imports
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export type EarningRow = {
  platform: string;
  technologies: string;
  earnings: string;
  progressPercentage: number;
};

type Props = {
  title: string;
  earning: string;
  trend: "up" | "down";
  percentage: number;
  comparisonText: string;
  earningData: EarningRow[];
  className?: string;
};

/**
 * Total earning card (etap 4, faza 3). Layout ported from AdminCN's
 * `widget-total-earning`, fully props-driven. Two honest subtractions:
 * the ellipsis menu (Share/Update/Refresh did nothing — dead buttons) and
 * the brand `img`s (no binary assets cross over; initials instead).
 */
const TotalEarningCard = ({
  earningData,
  title,
  earning,
  trend,
  percentage,
  comparisonText,
  className,
}: Props) => {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-6">
        <div className="text-lg font-semibold">{title}</div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold">{earning}</span>
            <span className="flex items-center gap-1">
              {trend === "up" ? (
                <ChevronUpIcon className="size-4" />
              ) : (
                <ChevronDownIcon className="size-4" />
              )}
              <span className="text-sm">{percentage}%</span>
            </span>
          </div>
          <span className="text-muted-foreground text-sm">{comparisonText}</span>
        </div>
      </CardContent>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-1 flex-col justify-evenly gap-4">
          {earningData.map((earning, index) => (
            <div key={index} className="flex items-center justify-between gap-2.5">
              <div className="flex items-center justify-between gap-2.5">
                <Avatar className="size-11 rounded-sm after:rounded-[inherit] after:border-0">
                  <AvatarFallback className="bg-primary/10 shrink-0 rounded-sm">
                    {earning.platform.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1">
                  <span className="text-base font-medium">{earning.platform}</span>
                  <span className="text-muted-foreground text-sm">{earning.technologies}</span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm">{earning.earnings}</p>
                <Progress
                  value={earning.progressPercentage}
                  className="**:data-[slot=progress-track]:h-1.5 w-36"
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default TotalEarningCard;
