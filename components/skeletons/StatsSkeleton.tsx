import React from 'react';

export const StatsSkeleton: React.FC = () => {
  return (
    <div className="space-y-10 animate-pulse">
      <section>
        <div className="flex justify-between items-center mb-6">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
        </div>

        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/60 shadow-md border border-gray-200 dark:border-gray-700">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto mb-4"></div>
          <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/60 shadow-md border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
          </div>
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/60 shadow-md border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
          </div>
        </div>
      </section>
    </div>
  );
};
