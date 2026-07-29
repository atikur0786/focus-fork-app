import { useState, useEffect, useCallback } from 'react'
import {
  Compass,
  Code2,
  MessageSquare,
  GitBranch,
  Sparkles,
  ArrowRight,
  X,
  Rocket,
  Search,
  GitFork,
  CheckCircle2
} from 'lucide-react'
import clsx from 'clsx'
import { ModalPortal } from './ModalPortal'

const STORAGE_KEY = 'focusfork-onboarding-complete'

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY)
    if (!completed) {
      setShowOnboarding(true)
    }
  }, [])

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setShowOnboarding(false)
  }, [])

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setShowOnboarding(true)
  }, [])

  return { showOnboarding, completeOnboarding, resetOnboarding }
}

interface OnboardingStep {
  title: string
  description: string
  icon: typeof Compass
  highlight?: string
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Welcome to FocusFork',
    description:
      'FocusFork guides you through contributing to open-source projects — from finding an issue to submitting a pull request. Let us walk you through the key features.',
    icon: Rocket,
    highlight: 'welcome'
  },
  {
    title: 'Discover Issues',
    description:
      'Start here. Search across thousands of open-source repositories, filter by language, difficulty, or label, and find the perfect issue to work on. Use "Evaluate fit" to get AI feedback on whether an issue matches your skills.',
    icon: Search,
    highlight: 'discover'
  },
  {
    title: 'Fork & Clone',
    description:
      'Found an issue? Click "Star, fork & clone" to automatically star and fork the repository to your GitHub account and clone it locally. Before you can do this, set your workspace folder in Settings — that\'s where repos will be cloned to.',
    icon: GitFork,
    highlight: 'fork'
  },
  {
    title: 'AI-Powered Workspace',
    description:
      'Edit code with a full editor, browse files, and use the built-in terminal. The AI assistant understands your issue context and can suggest code changes, which you can apply directly to your files.',
    icon: Code2,
    highlight: 'workspace'
  },
  {
    title: 'Chat with AI',
    description:
      'Ask the AI assistant for help understanding code, debugging, or writing implementations. It knows about your issue, your repo, and the file you\'re editing. Use it like a pair-programming partner.',
    icon: MessageSquare,
    highlight: 'chat'
  },
  {
    title: 'Code Review & Ship',
    description:
      'When you\'re ready, the built-in review agent checks your changes for bugs and style issues before committing. Then commit, push, and create a pull request — all from within the app.',
    icon: CheckCircle2,
    highlight: 'review'
  },
  {
    title: 'Track Your Contributions',
    description:
      'View your contribution history, see what you\'ve forked, cloned, and submitted. Head to Settings to configure your workspace directory and AI preferences.',
    icon: GitBranch,
    highlight: 'history'
  },
  {
    title: 'You\'re All Set!',
    description:
      'Head to Discover to find your first issue. The open-source community is waiting for your contribution. Happy coding!',
    icon: Sparkles,
    highlight: 'ready'
  }
]

interface OnboardingGuideProps {
  onComplete: () => void
}

export function OnboardingGuide({ onComplete }: OnboardingGuideProps): React.JSX.Element {
  const [currentStep, setCurrentStep] = useState(0)
  const step = ONBOARDING_STEPS[currentStep]
  const isLast = currentStep === ONBOARDING_STEPS.length - 1
  const isFirst = currentStep === 0
  const Icon = step.icon

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onComplete()
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (isLast) onComplete()
        else setCurrentStep((s) => s + 1)
      }
      if (e.key === 'ArrowLeft' && !isFirst) {
        setCurrentStep((s) => s - 1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isLast, isFirst, onComplete])

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg panel shadow-xl page-enter overflow-hidden">
        {/* Skip button */}
        <div className="flex items-center justify-end px-4 pt-3">
          <button
            type="button"
            onClick={onComplete}
            className="text-[11px] text-text-muted hover:text-text-main transition-colors flex items-center gap-1"
          >
            Skip tour
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-2 pt-1">
          {/* Icon */}
          <div className="flex items-center justify-center mb-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/8 border border-primary/10 flex items-center justify-center">
              <Icon className="h-8 w-8 text-text-main" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-[18px] font-semibold text-text-main text-center leading-snug">
            {step.title}
          </h2>

          {/* Description */}
          <p className="mt-3 text-[13px] leading-relaxed text-text-secondary text-center">
            {step.description}
          </p>
        </div>

        {/* Progress dots + navigation */}
        <div className="px-6 pb-5 pt-4">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-5">
            {ONBOARDING_STEPS.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentStep(index)}
                className={clsx(
                  'rounded-full transition-all duration-200',
                  index === currentStep
                    ? 'w-6 h-2 bg-primary'
                    : index < currentStep
                      ? 'w-2 h-2 bg-primary/40'
                      : 'w-2 h-2 bg-border-strong'
                )}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep((s) => s - 1)}
              disabled={isFirst}
              className="btn-ghost text-[13px] px-4 py-2 disabled:opacity-0"
            >
              Back
            </button>

            <div className="flex items-center gap-2">
              {!isLast && (
                <button
                  type="button"
                  onClick={onComplete}
                  className="btn-ghost text-[13px] px-3 py-2 text-text-muted"
                >
                  Skip all
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isLast) onComplete()
                  else setCurrentStep((s) => s + 1)
                }}
                className="btn-primary text-[13px] py-2 px-5"
              >
                {isLast ? (
                  <>
                    Get started
                    <Sparkles size={14} />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Step counter */}
        <div className="border-t border-border px-6 py-2.5 bg-surface/60">
          <div className="text-[11px] text-text-muted text-center">
            Step {currentStep + 1} of {ONBOARDING_STEPS.length} · Use arrow keys to navigate
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
