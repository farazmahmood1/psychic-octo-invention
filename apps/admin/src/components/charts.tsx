import { useMemo } from 'react';

interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  barColor?: string;
  className?: string;
}

/**
 * A simple SVG bar chart with labels along the x-axis.
 */
export function MiniBarChart({ data, height = 160, barColor = 'hsl(var(--primary))', className = '' }: BarChartProps) {
  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);

  if (data.length === 0) return null;

  const barWidth = 100 / data.length;
  const barPad = barWidth * 0.2;

  return (
    <div className={className}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((d, i) => {
          const barH = (d.value / maxValue) * (height - 20);
          const x = i * barWidth + barPad / 2;
          const w = barWidth - barPad;
          const y = height - 20 - barH;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={w}
                height={barH}
                rx={0.5}
                fill={barColor}
                opacity={0.85}
              >
                <title>{`${d.label}: ${d.value}`}</title>
              </rect>
            </g>
          );
        })}
        {/* X-axis labels — show every other label to avoid crowding */}
        {data.map((d, i) => {
          if (data.length > 10 && i % 2 !== 0) return null;
          return (
            <text
              key={`label-${i}`}
              x={i * barWidth + barWidth / 2}
              y={height - 4}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: data.length > 10 ? 3 : 4 }}
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeColor?: string;
  fillColor?: string;
  className?: string;
}

/**
 * A simple SVG sparkline (area chart).
 */
export function Sparkline({
  data,
  width = 200,
  height = 48,
  strokeColor = 'hsl(var(--primary))',
  fillColor = 'hsl(var(--primary) / 0.15)',
  className = '',
}: SparklineProps) {
  const points = useMemo(() => {
    if (data.length === 0) return '';
    const max = Math.max(...data, 0.001);
    const step = width / Math.max(data.length - 1, 1);
    return data.map((v, i) => `${i * step},${height - (v / max) * (height - 4) - 2}`).join(' ');
  }, [data, width, height]);

  const areaPath = useMemo(() => {
    if (data.length === 0) return '';
    const max = Math.max(...data, 0.001);
    const step = width / Math.max(data.length - 1, 1);
    const linePoints = data.map((v, i) => `${i * step},${height - (v / max) * (height - 4) - 2}`);
    return `M0,${height} L${linePoints.join(' L')} L${width},${height} Z`;
  }, [data, width, height]);

  if (data.length < 2) return null;

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <path d={areaPath} fill={fillColor} />
      <polyline points={points} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
