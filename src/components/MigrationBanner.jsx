import React, { useEffect, useState } from "react";

const MigrationBanner = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let hideTimeout = null;

    // Check if there's any migration status to show
    // This could be expanded to check localStorage, API status, etc.
    const migrationStatus = localStorage.getItem("migration_status");

    if (migrationStatus === "in_progress") {
      setMessage("Aplikasi sedang diperbarui...");
      setIsVisible(true);
    } else if (migrationStatus === "completed") {
      setMessage("Aplikasi sudah siap dipakai.");
      setIsVisible(true);
      hideTimeout = window.setTimeout(() => setIsVisible(false), 5000);
    }

    return () => {
      if (hideTimeout) {
        window.clearTimeout(hideTimeout);
      }
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="bg-blue-500 px-4 py-2 text-center text-sm font-medium text-white">
      <div className="flex items-center justify-center gap-2">
        <span>{message}</span>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="ml-2 text-lg leading-none text-white hover:text-blue-100"
          aria-label="Tutup banner"
        >
          x
        </button>
      </div>
    </div>
  );
};

export default MigrationBanner;
