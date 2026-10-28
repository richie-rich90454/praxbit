import type { JSX } from "solid-js";

export function Logo(props: { readonly compact?: boolean }): JSX.Element {
    return (
        <span class="brand">
            <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
                <rect width="64" height="64" rx="5" fill="#FFFFFF" />
                <rect x="5" y="5" width="54" height="54" rx="5" fill="#B54131" />
                <rect x="18" y="20" width="10" height="10" fill="#FFFFFF" />
                <rect x="36" y="20" width="10" height="10" fill="#FFFFFF" />
                <rect x="23" y="24" width="5" height="5" fill="#B54131" />
                <rect x="41" y="24" width="5" height="5" fill="#B54131" />
                <rect x="22" y="42" width="20" height="5" fill="#FFFFFF" />
                <rect x="30" y="5" width="4" height="8" fill="#000000" />
                <path d="M32 13l5 5-5 5-5-5z" fill="#000000" />
            </svg>
            <span>{props.compact === true ? "Praxbit" : "Praxbit"}</span>
        </span>
    );
}
