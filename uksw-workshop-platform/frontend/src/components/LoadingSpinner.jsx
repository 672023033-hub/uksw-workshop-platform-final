export default function LoadingSpinner({ size = 'md', text = 'Loading...' }) {
    const sizeClasses = {
        sm: 'h-4 w-4 border-2',
        md: 'h-8 w-8 border-3',
        lg: 'h-12 w-12 border-4',
    }

    return (
        <div className="flex flex-col items-center justify-center gap-3">
            <div
                className={`${sizeClasses[size]} animate-spin rounded-full border-primary border-t-transparent`}
            />
            {text && <p className="text-text-muted text-sm">{text}</p>}
        </div>
    )
}
