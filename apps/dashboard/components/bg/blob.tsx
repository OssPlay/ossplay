import React from "react";

export default function UiBgBlob({
    blobColor = "#BB004B",
    backgroundColor = "#262626",
    size = "100%",
    ...props
}: React.SVGProps<SVGSVGElement> & {
    blobColor?: string;
    backgroundColor?: string;
    size?: React.CSSProperties["width"] | React.CSSProperties["height"];
}) {
    return (
        <svg
            id="visual"
            viewBox="0 0 675 900"
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            version="1.1"
            {...props}
        >
            <rect
                x="0"
                y="0"
                width="675"
                height="900"
                fill={backgroundColor}
                style={{ fill: backgroundColor }}
            >
            </rect>
            <g transform="translate(343.7000905140511 492.6098840260849)">
                <path
                    d="M109.9 -214.7C128.2 -179.9 118.9 -121.6 132.2 -81.9C145.4 -42.2 181.2 -21.1 202.9 12.5C224.6 46.2 232.3 92.3 208.4 113.7C184.6 135.1 129.3 131.6 89.3 142C49.3 152.4 24.7 176.7 -6.2 187.4C-37 198.1 -74 195.2 -93.5 172.9C-113 150.7 -114.9 109.1 -124.3 77C-133.6 45 -150.3 22.5 -175.7 -14.7C-201.1 -51.8 -235.2 -103.7 -235.5 -152.4C-235.8 -201.1 -202.3 -246.7 -157.4 -266.1C-112.5 -285.5 -56.3 -278.8 -5.2 -269.7C45.8 -260.7 91.7 -249.4 109.9 -214.7"
                    fill={blobColor}
                >
                </path>
            </g>
        </svg>
    );
}
