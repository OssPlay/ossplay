import UiBgBlob from "@/components/bg/blob";
import Image from "next/image";
import React from "react";

export default function Layout({ children }: React.PropsWithChildren) {
    return (
        <div className="flex flex-1 flex-row">
            <div className="flex-1 hidden lg:flex relative overflow-hidden w-0 lg:min-w-1/2">
                <UiBgBlob
                    blobColor="var(--primary)"
                    backgroundColor="var(--muted)"
                    className="absolute inset-0"
                />
                <Image
                    src="/statics/logo.png"
                    alt="OSSPlay"
                    width={60}
                    height={60}
                    className="absolute top-8 left-8"
                />
            </div>
            <div className="flex-1 flex flex-col min-w-1/2">{children}</div>
        </div>
    );
}
