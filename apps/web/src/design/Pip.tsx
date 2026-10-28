import type { JSX } from "solid-js";
import "./pip.css";

export type PipPose = "observing" | "explaining" | "thinking" | "alert" | "celebrating";

export interface PipProps {
    readonly pose?: PipPose;
    readonly size?: number;
    readonly label?: string;
}

export function Pip(props: PipProps): JSX.Element {
    const size = props.size ?? 96;
    const pose = props.pose ?? "observing";
    const label = props.label ?? "Pip, the Praxbit bit sprite";

    return (
        <svg
            class={`pip pip--${pose}`}
            width={size}
            height={size}
            viewBox="0 0 120 120"
            role="img"
            aria-label={label}
        >
            <rect x="14" y="26" width="92" height="82" rx="5" fill="#B54131" />
            <rect x="24" y="34" width="72" height="58" rx="5" fill="#FFF8EE" />
            <rect x="52" y="10" width="6" height="18" fill="#000000" />
            <path d="M55 6l8 8-8 8-8-8z" fill="#B54131" />
            <rect x="38" y="48" width="14" height="14" fill="#000000" />
            <rect x="68" y="48" width="14" height="14" fill="#000000" />
            <rect x="42" y="52" width="6" height="6" fill="#FFF8EE" />
            <rect x="72" y="52" width="6" height="6" fill="#FFF8EE" />
            {pose === "celebrating" ? (
                <path
                    d="M48 72q6 8 12 0q6 8 12 0"
                    fill="none"
                    stroke="#000000"
                    stroke-width="3"
                    stroke-linecap="round"
                />
            ) : pose === "alert" ? (
                <path
                    d="M52 74h16"
                    fill="none"
                    stroke="#000000"
                    stroke-width="3"
                    stroke-linecap="round"
                />
            ) : (
                <path
                    d="M48 76q12 6 24 0"
                    fill="none"
                    stroke="#000000"
                    stroke-width="3"
                    stroke-linecap="round"
                />
            )}
            <rect x="24" y="94" width="14" height="12" fill="#B54131" />
            <rect x="82" y="94" width="14" height="12" fill="#B54131" />
            {pose === "explaining" ? (
                <path d="M96 60l14-10" stroke="#B54131" stroke-width="6" stroke-linecap="round" />
            ) : pose === "thinking" ? (
                <path d="M24 60l-10 14" stroke="#B54131" stroke-width="6" stroke-linecap="round" />
            ) : pose === "alert" ? (
                <path d="M96 60l12-14" stroke="#B54131" stroke-width="6" stroke-linecap="round" />
            ) : null}
            {pose === "thinking" ? (
                <g>
                    <circle cx="106" cy="30" r="4" fill="#B54131" />
                    <circle cx="112" cy="22" r="2.5" fill="#B54131" />
                </g>
            ) : null}
        </svg>
    );
}
