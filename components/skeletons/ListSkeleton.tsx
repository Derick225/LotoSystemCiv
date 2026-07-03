import React from 'react';

export const ListSkeleton: React.FC = () => {
    return (
        <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow animate-pulse">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-3"></div>
                    <div className="flex gap-2">
                        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                </div>
            ))}
        </div>
    );
};
