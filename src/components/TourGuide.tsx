import React, { useState, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS, Step, EVENTS, ACTIONS } from 'react-joyride';

interface TourGuideProps {
  lang: 'en' | 'fa';
  run: boolean;
  onFinish: () => void;
}

export const TourGuide: React.FC<TourGuideProps> = ({ lang, run, onFinish }) => {
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const enSteps: Step[] = [
      {
        target: 'body',
        content: 'Welcome to The Living Atlas of Greater Iran! Let\'s take a comprehensive tour of all the features.',
        placement: 'center',
        disableBeacon: true,
      },
      {
        target: isMobile ? '#tour-map-mobile' : '#tour-map-desktop',
        content: 'This is the interactive map. Click on any region to see its ruler, dynasty, and detailed history for the selected year. You can also ask AI for context on that specific location at that time!',
        placement: 'center',
      },
      {
        target: isMobile ? '#tour-timeline-mobile' : '#tour-timeline-desktop',
        content: 'The Timeline is your time machine. Drag the slider or click on dynasty capsules to jump to specific eras. The map and data will instantly update.',
        placement: 'top',
      },
      {
        target: isMobile ? '#tour-timeline-ai-mobile' : '#tour-timeline-ai-desktop',
        content: 'Want to know the global context? Click the "Era Context" button to fetch historical events happening around the world during this specific year.',
        placement: 'top',
      },
      {
        target: isMobile ? '#tour-events-panel-mobile' : '#tour-events-panel-desktop',
        content: 'This panel shows major historical events, notable figures (scholars, poets, generals), and significant heritage/artifacts from the selected time on the timeline.',
        placement: 'left',
      },
      {
        target: isMobile ? '#tour-ai-fetch-mobile' : '#tour-ai-fetch-desktop',
        content: 'If you want to dig deeper, use these AI buttons to dynamically discover more events, figures, and heritage for the current year.',
        placement: 'left',
      },
      {
        target: 'body',
        content: 'Whenever you click on an event, figure, artifact, or region, a detailed modal opens. It includes Wikipedia links, AI deep dives, and a dedicated "What If?" feature to explore alternate histories!',
        placement: 'center',
      },
      {
        target: isMobile ? '#tour-search-mobile' : '#tour-search-desktop',
        content: 'Looking for something specific? Search for dynasties, rulers, events, or regions. We\'ll take you right to their most prominent year.',
        placement: 'bottom',
      },
      {
        target: '#tour-chatbot', // Shared across both views
        content: 'Meet your AI Historian! You can ask general questions about history, inquire about specific battles, or get deeper context about any topic.',
        placement: 'top',
      },
      {
        target: isMobile ? '#tour-lang-mobile' : '#tour-lang-desktop',
        content: 'Finally, you can switch the entire application between English and Persian (Farsi) at any time.',
        placement: 'bottom',
      }
    ];

    const faSteps: Step[] = [
      {
        target: 'body',
        content: 'به اطلس تاریخ ایران بزرگ خوش آمدید! بیایید یک تور جامع از تمام ویژگی‌ها داشته باشیم.',
        placement: 'center',
        disableBeacon: true,
      },
      {
        target: isMobile ? '#tour-map-mobile' : '#tour-map-desktop',
        content: 'این نقشه تعاملی است. روی هر منطقه کلیک کنید تا حاکم، سلسله و تاریخچه دقیق آن را در سال انتخاب شده ببینید. همچنین می‌توانید از هوش مصنوعی درباره زمینه آن مکان خاص در آن زمان بپرسید!',
        placement: 'center',
      },
      {
        target: isMobile ? '#tour-timeline-mobile' : '#tour-timeline-desktop',
        content: 'خط زمان ماشین زمان شماست. نوار لغزان را بکشید یا روی کپسول‌های سلسله‌ها کلیک کنید تا به دوره‌های خاص بروید. نقشه و داده‌ها فوراً به‌روز می‌شوند.',
        placement: 'top',
      },
      {
        target: isMobile ? '#tour-timeline-ai-mobile' : '#tour-timeline-ai-desktop',
        content: 'می‌خواهید زمینه جهانی را بدانید؟ روی دکمه "زمینه دوران" کلیک کنید تا رویدادهای تاریخی که در سراسر جهان در این سال خاص رخ داده‌اند را دریافت کنید.',
        placement: 'top',
      },
      {
        target: isMobile ? '#tour-events-panel-mobile' : '#tour-events-panel-desktop',
        content: 'این پنل رویدادهای مهم تاریخی، شخصیت‌های برجسته (دانشمندان، شاعران، ژنرال‌ها) و میراث/آثار باستانی مهم زمان انتخاب شده در خط زمان را نشان می‌دهد.',
        placement: 'left',
      },
      {
        target: isMobile ? '#tour-ai-fetch-mobile' : '#tour-ai-fetch-desktop',
        content: 'اگر می‌خواهید عمیق‌تر شوید، از این دکمه‌های هوش مصنوعی برای کشف پویا رویدادها، شخصیت‌ها و میراث بیشتر برای سال جاری استفاده کنید.',
        placement: 'left',
      },
      {
        target: 'body',
        content: 'هر زمان که روی یک رویداد، شخصیت، اثر باستانی یا منطقه کلیک کنید، یک پنجره دقیق باز می‌شود. این شامل پیوندهای ویکی‌پدیا، بررسی‌های عمیق هوش مصنوعی و یک ویژگی اختصاصی "چه می‌شد اگر؟" برای کاوش در تاریخ‌های جایگزین است!',
        placement: 'center',
      },
      {
        target: isMobile ? '#tour-search-mobile' : '#tour-search-desktop',
        content: 'به دنبال چیز خاصی هستید؟ سلسله‌ها، حاکمان، رویدادها یا مناطق را جستجو کنید. ما شما را مستقیماً به برجسته‌ترین سال آنها می‌بریم.',
        placement: 'bottom',
      },
      {
        target: '#tour-chatbot', // Shared
        content: 'با مورخ هوش مصنوعی خود آشنا شوید! می‌توانید سوالات کلی درباره تاریخ بپرسید، درباره نبردهای خاص سوال کنید، یا زمینه عمیق‌تری درباره هر موضوعی دریافت کنید.',
        placement: 'top',
      },
      {
        target: isMobile ? '#tour-lang-mobile' : '#tour-lang-desktop',
        content: 'در نهایت، شما می‌توانید در هر زمان کل برنامه را بین انگلیسی و فارسی تغییر دهید.',
        placement: 'bottom',
      }
    ];

    const totalSteps = lang === 'en' ? enSteps.length : faSteps.length;
    const finalSteps = (lang === 'en' ? enSteps : faSteps).map((step, index) => ({
      ...step,
      locale: {
        next: lang === 'en' 
          ? `Next (${index + 1}/${totalSteps})` 
          : `بعدی (${index + 1} از ${totalSteps})`,
        back: lang === 'en' ? 'Back' : 'قبلی',
        last: lang === 'en' ? 'Finish' : 'پایان',
        skip: lang === 'en' ? 'Skip' : 'رد شدن',
      }
    }));

    setSteps(finalSteps);
  }, [lang, isMobile]);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { action, index, status, type } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setStepIndex(0);
      onFinish();
    } else if (([EVENTS.STEP_AFTER, EVENTS.TARGET_NOT_FOUND] as string[]).includes(type)) {
      // Advance step by reading the action type, deferring to break reflow
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      requestAnimationFrame(() => {
        setStepIndex(nextIndex);
      });
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous={true}
      showProgress={false}
      showSkipButton={true}
      callback={handleJoyrideCallback}
      floaterProps={{
        disableAnimation: true,
        styles: {
          floater: {
            direction: 'ltr', // Force floater positioning logic to LTR to fix RTL offset bugs
            zIndex: 10000
          }
        }
      }}
      styles={{
        options: {
          primaryColor: '#6366f1', // indigo-500
          backgroundColor: '#0f172a', // slate-900
          textColor: '#f8fafc', // slate-50
          arrowColor: '#0f172a',
          overlayColor: 'rgba(2, 6, 23, 0.7)', // slate-950 with opacity
          zIndex: 10000,
        },
        tooltipContainer: {
          textAlign: lang === 'fa' ? 'right' : 'left',
          direction: lang === 'fa' ? 'rtl' : 'ltr',
        },
        buttonNext: {
          backgroundColor: '#6366f1',
          borderRadius: '8px',
          padding: '8px 16px',
        },
        buttonBack: {
          color: '#cbd5e1',
          marginRight: lang === 'fa' ? '0' : '10px',
          marginLeft: lang === 'fa' ? '10px' : '0',
        },
        buttonSkip: {
          color: '#94a3b8',
        }
      }}
      locale={{
        back: lang === 'en' ? 'Back' : 'قبلی',
        close: lang === 'en' ? 'Close' : 'بستن',
        last: lang === 'en' ? 'Finish' : 'پایان',
        next: lang === 'en' ? 'Next' : 'بعدی',
        skip: lang === 'en' ? 'Skip' : 'رد شدن',
      }}
    />
  );
};
